import { GOOGLE_DRIVE_FOLDER_ID, DriveFolderFile } from '../data/googleDriveFolderData';
import { getAccessToken, clearSavedToken } from './googleAuth';
import { compressImageToTargetSize, formatBytes } from './imageCompressor';

export interface UploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  thumbnailUrl: string;
  driveFile: DriveFolderFile;
  originalSizeBytes: number;
  uploadedSizeBytes: number;
  wasCompressed: boolean;
}

/**
 * Deletes a single image file from Google Drive.
 */
export async function deleteImageFromGoogleDrive(fileId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
       const errText = await response.text();
       if (response.status === 404) {
         console.warn(`File ${fileId} already deleted from Drive (404).`);
         return true; // Consider it a success if it's already gone
       }
       console.warn(`Failed to delete Google Drive file ${fileId}:`, errText);
       throw new Error(`Drive API Error ${response.status}: ${errText}`);
    }
    return true;
  } catch (err) {
    console.warn(`Error deleting Google Drive file ${fileId}:`, err);
    return false;
  }
}

/**
 * Deletes multiple images from Google Drive in parallel.
 */
export async function deleteMultipleImagesFromGoogleDrive(fileIds: string[]): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];

  const promises = fileIds.map(async (fileId) => {
    try {
      const ok = await deleteImageFromGoogleDrive(fileId);
      if (ok) {
        deleted.push(fileId);
      } else {
        failed.push(fileId);
      }
    } catch {
      failed.push(fileId);
    }
  });

  await Promise.allSettled(promises);
  return { deleted, failed };
}

/**
 * Compensating transaction rollback: deletes recently uploaded files if Sheet write fails.
 */
export async function rollbackUploadedDriveFiles(fileIds: string[]): Promise<void> {
  if (!fileIds || fileIds.length === 0) return;
  console.warn(`[Rollback] Purging ${fileIds.length} newly uploaded Drive files due to downstream failure...`);
  await deleteMultipleImagesFromGoogleDrive(fileIds);
}

/**
 * Pings Google Drive to verify all file IDs exist (HTTP 200).
 */
export async function verifyDriveFilesExist(fileIds: string[]): Promise<{ allExist: boolean; results: Record<string, boolean> }> {
  const token = await getAccessToken();
  if (!token) return { allExist: false, results: {} };

  const results: Record<string, boolean> = {};
  let allExist = true;

  await Promise.allSettled(
    fileIds.map(async (id) => {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const exists = res.ok;
        results[id] = exists;
        if (!exists) allExist = false;
      } catch {
        results[id] = false;
        allExist = false;
      }
    })
  );

  return { allExist, results };
}

/**
 * Pings Google Drive to verify all file IDs are deleted (HTTP 404).
 */
export async function verifyDriveFilesDeleted(fileIds: string[]): Promise<{ allDeleted: boolean; results: Record<string, boolean> }> {
  const token = await getAccessToken();
  if (!token) return { allDeleted: false, results: {} };

  const results: Record<string, boolean> = {};
  let allDeleted = true;

  await Promise.allSettled(
    fileIds.map(async (id) => {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const deleted = res.status === 404;
        results[id] = deleted;
        if (!deleted) allDeleted = false;
      } catch {
        results[id] = true;
      }
    })
  );

  return { allDeleted, results };
}

/**
 * Formats meal photo file names according to the clinical specification:
 * Format: {MealID}_{CleanDishName}_{YYYY-MM-DD}[_photoX].jpg
 * Example: M-023_Kuaci_Biji_Bunga_Matahari_Package_2026-09-06.jpg
 * Multiple: M-028_Kuaci_Biji_Bunga_Matahari_2026-09-10_photo1.jpg, M-028_Kuaci_Biji_Bunga_Matahari_2026-09-10_photo2.jpg
 */
export function formatStandardMealPhotoName(params: {
  mealId?: string;
  dishName?: string;
  dateStr?: string;
  imageIndex?: number;
  totalImages?: number;
  originalFileName?: string;
}): string {
  const mealId = params.mealId ? params.mealId.trim().toUpperCase() : 'M-000';

  // Format clean dish name
  let cleanDish = 'Dish';
  if (params.dishName && params.dishName.trim()) {
    cleanDish = params.dishName
      .trim()
      .replace(/[^\w\s-]/g, '')
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('_')
      .slice(0, 50);
  } else if (params.originalFileName) {
    const withoutExt = params.originalFileName.replace(/\.[^/.]+$/, '');
    if (/^(PXL|IMG|DSC|PHOTO|IMAGE|SCREENSHOT|PANO)[\d_() -]*/i.test(withoutExt)) {
      cleanDish = 'Meal_Photo';
    } else {
      cleanDish = withoutExt
        .replace(/[^\w\s-]/g, '')
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('_')
        .slice(0, 50);
    }
  }

  // Format date strictly as YYYY-MM-DD
  let datePart = params.dateStr;
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    if (datePart && /^\d{2}\/\d{2}\/\d{4}$/.test(datePart)) {
      const parts = datePart.split('/');
      datePart = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
      datePart = new Date().toISOString().split('T')[0];
    }
  }

  // Multi-image index indicated strictly at the end before extension
  const total = params.totalImages ?? (params.imageIndex !== undefined && params.imageIndex > 0 ? 2 : 1);
  let photoSuffix = '';
  if (total > 1 && params.imageIndex !== undefined) {
    photoSuffix = `_photo${params.imageIndex + 1}`;
  }

  return `${mealId}_${cleanDish}_${datePart}${photoSuffix}.jpg`;
}

/**
 * Uploads a single image File or Blob directly to the user's designated Google Drive folder.
 * Automatically compresses images larger than 200 KB to under 200 KB before uploading.
 * Adds Google Drive appProperties: { jobId, mealId, imageIndex } for structured querying.
 */
export async function uploadImageToGoogleDrive(
  file: File | Blob,
  options?: {
    customFileName?: string;
    mealId?: string;
    dishName?: string;
    jobId?: string;
    imageIndex?: number;
    totalImages?: number;
    dateStr?: string;
    description?: string;
    folderId?: string;
    compress?: boolean;
    maxSizeBytes?: number;
    onProgressStatus?: (status: string) => void;
  }
): Promise<UploadResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google Drive authorization token not found. Please click "Connect Google Drive" to sign in first.');
  }

  const targetFolderId = options?.folderId || GOOGLE_DRIVE_FOLDER_ID;
  const maxBytes = options?.maxSizeBytes ?? (200 * 1024); // 200 KB default target

  let fileToUpload: File | Blob = file;
  let originalSizeBytes = file.size;
  let uploadedSizeBytes = file.size;
  let wasCompressed = false;

  // Determine standard file name adhering to {MealID}_{DishName}_{Date}[_photoX].jpg
  let fileName = options?.customFileName;
  if (!fileName) {
    const rawOriginalName = (fileToUpload as File).name || (file as File).name || 'meal_photo.jpg';
    fileName = formatStandardMealPhotoName({
      mealId: options?.mealId,
      dishName: options?.dishName,
      dateStr: options?.dateStr,
      imageIndex: options?.imageIndex,
      totalImages: options?.totalImages,
      originalFileName: rawOriginalName,
    });
  }

  // Compress image if enabled (default true)
  if (options?.compress !== false) {
    try {
      if (options?.onProgressStatus) {
        options.onProgressStatus(`Compressing image to target <200 KB (${formatBytes(file.size)})...`);
      }
      const compression = await compressImageToTargetSize(file, maxBytes, fileName);
      fileToUpload = compression.file;
      uploadedSizeBytes = compression.compressedSize;
      wasCompressed = compression.wasCompressed;
      
      console.log(`Image compression: ${formatBytes(originalSizeBytes)} -> ${formatBytes(uploadedSizeBytes)} (limit: ${formatBytes(maxBytes)})`);
      if (options?.onProgressStatus) {
        options.onProgressStatus(`Compressed to ${formatBytes(uploadedSizeBytes)}. Uploading to Google Drive...`);
      }
    } catch (compErr) {
      console.warn('Image compression encountered an error, proceeding with original file:', compErr);
    }
  }

  // When compressed, the output is standard JPEG
  const mimeType = (fileToUpload as File).type || 'image/jpeg';

  // Metadata object for Google Drive API with appProperties
  const metadata = {
    name: fileName,
    parents: [targetFolderId],
    description: options?.description || `Meal photo uploaded from Nutrition Tracker for ${options?.mealId || 'general meal'} on ${options?.dateStr || new Date().toLocaleDateString('en-GB')}`,
    mimeType: mimeType,
    appProperties: {
      jobId: options?.jobId || '',
      mealId: options?.mealId || '',
      imageIndex: String(options?.imageIndex ?? 0),
    },
  };

  const boundary = '-------' + Math.random().toString(36).substring(2) + Date.now().toString(36);

  // Construct multipart/related body
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaHeaderPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closingPart = `\r\n--${boundary}--`;

  const multipartBody = new Blob([
    metadataPart,
    mediaHeaderPart,
    fileToUpload,
    closingPart,
  ], { type: `multipart/related; boundary=${boundary}` });

  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,thumbnailLink,mimeType,parents,appProperties`;

  let response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  // If upload to specific parent folder failed due to permissions or folder not found, retry directly in user's Drive root
  if (!response.ok && (response.status === 404 || response.status === 403) && targetFolderId) {
    console.warn(`Target folder ${targetFolderId} returned HTTP ${response.status}. Retrying upload to Google Drive root...`);
    const fallbackMetadata = {
      name: fileName,
      description: options?.description || `Meal photo uploaded from Nutrition Tracker for ${options?.mealId || 'general meal'} on ${options?.dateStr || new Date().toLocaleDateString('en-GB')}`,
      mimeType: mimeType,
      appProperties: metadata.appProperties,
    };
    const fallbackMetadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(fallbackMetadata)}\r\n`;
    const fallbackMultipartBody = new Blob([
      fallbackMetadataPart,
      mediaHeaderPart,
      fileToUpload,
      closingPart,
    ], { type: `multipart/related; boundary=${boundary}` });

    response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: fallbackMultipartBody,
    });
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSavedToken();
    }
    const errorText = await response.text();
    console.warn('Google Drive upload error response:', errorText);
    let message = response.status === 401 
      ? 'Google Drive session expired. Please sign in again to refresh authorization.'
      : `Failed to upload photo to Google Drive (HTTP ${response.status}).`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error?.message) {
        message = `Google Drive Error: ${errJson.error.message}`;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  const result = await response.json();
  const fileId = result.id;
  const finalName = result.name || fileName;
  const webViewLink = result.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  const thumbnailUrl = `https://lh3.googleusercontent.com/d/${fileId}=w1000`;

  // Grant read permission so thumbnail preview renders in the browser
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
  } catch (permErr) {
    console.warn('Could not set anyone-with-link permission on Drive file:', permErr);
  }

  const driveFile: DriveFolderFile = {
    id: fileId,
    name: finalName,
    url: thumbnailUrl,
    directViewUrl: webViewLink,
    mealId: options?.mealId,
    dateStr: options?.dateStr || new Date().toLocaleDateString('en-GB'),
  };

  return {
    fileId,
    fileName: finalName,
    webViewLink,
    thumbnailUrl,
    driveFile,
    originalSizeBytes,
    uploadedSizeBytes,
    wasCompressed,
  };
}

/**
 * Concurrently uploads multiple images (1 to N) to Google Drive with controlled concurrency pool (max 2).
 * Automatically handles sequential compression and appProperties tagging.
 */
export async function uploadMultipleImagesToGoogleDrive(
  files: (File | Blob)[],
  options?: {
    mealId?: string;
    dishName?: string;
    jobId?: string;
    dateStr?: string;
    folderId?: string;
    concurrency?: number;
    onProgressStatus?: (status: string, completed: number, total: number) => void;
  }
): Promise<UploadResult[]> {
  if (!files || files.length === 0) return [];

  const results: UploadResult[] = [];
  const concurrency = options?.concurrency ?? 2;
  const total = files.length;
  let completed = 0;

  // Process files with bounded concurrency
  const queue = files.map((file, index) => ({ file, index }));

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const { file, index } = item;
      if (options?.onProgressStatus) {
        options.onProgressStatus(`Processing photo ${index + 1} of ${total}...`, completed, total);
      }

      const uploadRes = await uploadImageToGoogleDrive(file, {
        mealId: options?.mealId,
        dishName: options?.dishName,
        jobId: options?.jobId,
        imageIndex: index,
        totalImages: total,
        dateStr: options?.dateStr,
        folderId: options?.folderId,
        onProgressStatus: (subStatus) => {
          if (options?.onProgressStatus) {
            options.onProgressStatus(`Photo ${index + 1}/${total}: ${subStatus}`, completed, total);
          }
        },
      });

      results[index] = uploadRes;
      completed++;
      if (options?.onProgressStatus) {
        options.onProgressStatus(`Uploaded photo ${completed} of ${total}`, completed, total);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Fetches real files list from the designated Google Drive folder if the user is authenticated.
 */
export async function fetchGoogleDriveFolderFiles(folderId?: string): Promise<DriveFolderFile[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const targetFolderId = folderId || GOOGLE_DRIVE_FOLDER_ID;

  try {
    const query = `'${targetFolderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime,description,appProperties)&orderBy=createdTime+desc&pageSize=100`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearSavedToken();
      }
      console.warn('Could not list Google Drive files:', await response.text());
      return [];
    }

    const data = await response.json();
    if (!data.files || !Array.isArray(data.files)) return [];

    return data.files
      .filter((f: any) => f.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.name))
      .map((f: any) => {
        // Parse meal id if present in appProperties or filename like "M-016_..."
        const appMealId = f.appProperties?.mealId;
        const mealMatch = f.name.match(/^(M-\d+|KFC-\d+|Obalab-\d+)/i);
        const mealId = appMealId || (mealMatch ? mealMatch[1].toUpperCase() : undefined);
        
        // Parse date from createdTime or filename
        let dateStr: string | undefined;
        const dateMatch = f.name.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const [y, m, d] = dateMatch[1].split('-');
          dateStr = `${d}/${m}/${y}`;
        } else if (f.createdTime) {
          const d = new Date(f.createdTime);
          dateStr = d.toLocaleDateString('en-GB');
        }

        return {
          id: f.id,
          name: f.name,
          url: `https://lh3.googleusercontent.com/d/${f.id}=w1000`,
          directViewUrl: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          mealId,
          dateStr,
        };
      });
  } catch (err) {
    console.warn('Error fetching files from Google Drive:', err);
    return [];
  }
}
