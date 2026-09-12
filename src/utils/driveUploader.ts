import { GOOGLE_DRIVE_FOLDER_ID, DriveFolderFile } from '../data/googleDriveFolderData';
import { getAccessToken, clearSavedToken } from './googleAuth';
import { compressImageToTargetSize, formatBytes } from './imageCompressor';
import { registerDrivePhoto, runtimeDrivePhotoCache, extractDriveFileId } from './driveImage';

export const OBSOLETE_TEMPLATE_FOLDER_ID = '1bnF0AV0N1ua2kVDKsA5-PA1CQ-7Y4tPN';

/**
 * Retrieves the user's active Google Drive folder ID from localStorage,
 * explicitly filtering out the obsolete template folder ID.
 */
export function getActiveDriveFolderId(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('nutrihealth_drive_folder_id');
    if (stored && stored.trim() && stored !== OBSOLETE_TEMPLATE_FOLDER_ID) {
      return stored.trim();
    }
  }
  return '';
}

/**
 * Retrieves the user's active Google Drive folder display name from localStorage.
 */
export function getActiveDriveFolderName(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('nutrihealth_drive_folder_name');
    if (stored && stored.trim()) {
      return stored.trim();
    }
  }
  return 'Meal_log_perso';
}

/**
 * Persists the user's selected Google Drive folder ID/URL and name to localStorage.
 */
export function setActiveDriveFolder(idOrUrl: string, name?: string) {
  if (typeof window !== 'undefined') {
    const idMatch = idOrUrl.match(/[-\w]{25,}/);
    const cleanId = idMatch ? idMatch[0] : idOrUrl.trim();
    if (cleanId && cleanId !== OBSOLETE_TEMPLATE_FOLDER_ID) {
      localStorage.setItem('nutrihealth_drive_folder_id', cleanId);
    }
    if (name && name.trim()) {
      localStorage.setItem('nutrihealth_drive_folder_name', name.trim());
    }
  }
}

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
 * Renames a file in Google Drive in-place via PATCH.
 * Intelligently resolves synthetic client IDs (e.g. photo-M-032-0) to physical Drive IDs
 * and safely prevents 404 network errors for spreadsheet-only cell references.
 */
export async function renameGoogleDriveFile(fileId: string, newName: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token || !fileId || !newName) return false;

  let actualDriveId = fileId.trim();

  // 1. Resolve Drive ID if it was passed as a URL
  const extractedId = extractDriveFileId(actualDriveId);
  if (extractedId) {
    actualDriveId = extractedId;
  }

  // 2. Handle synthetic client IDs (e.g. photo-M-032-0 or meal-xxx)
  if (actualDriveId.startsWith('photo-') || actualDriveId.startsWith('meal-') || actualDriveId.startsWith('temp-')) {
    // Check runtime cache by ID or newName or oldName
    const cached = runtimeDrivePhotoCache.get(actualDriveId.toLowerCase()) || 
                   runtimeDrivePhotoCache.get(newName.toLowerCase());
    if (cached && cached.id && !cached.id.startsWith('photo-') && !cached.id.startsWith('meal-')) {
      actualDriveId = cached.id;
    } else {
      // Attempt to search Google Drive by meal ID to find the real physical file
      const mealMatch = actualDriveId.match(/M-\d+/i) || newName.match(/M-\d+/i);
      if (mealMatch) {
        try {
          const searchQ = `name contains '${mealMatch[0]}' and trashed = false`;
          const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&fields=files(id,name)&pageSize=10`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (searchRes.ok) {
            const sData = await searchRes.json();
            if (sData.files && sData.files.length > 0) {
              actualDriveId = sData.files[0].id;
              registerDrivePhoto(actualDriveId, { id: actualDriveId, name: newName, url: `https://lh3.googleusercontent.com/d/${actualDriveId}=w1000`, directViewUrl: `https://drive.google.com/file/d/${actualDriveId}/view` });
            }
          }
        } catch (searchErr) {
          console.warn('[Drive Rename] Search fallback notice:', searchErr);
        }
      }
    }
  }

  // 3. If it is still a synthetic ID, it is a spreadsheet-only reference (not a physical file on Drive).
  // Safely return true without making an invalid PATCH request that would trigger HTTP 404!
  if (actualDriveId.startsWith('photo-') || actualDriveId.startsWith('meal-') || actualDriveId.startsWith('temp-')) {
    console.info(`[Google Drive] Skipping Drive PATCH for spreadsheet cell reference "${fileId}". Spreadsheet Column AO and card will update directly.`);
    return true;
  }

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${actualDriveId}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.info(`[Google Drive] File ${actualDriveId} not found on Drive (404). File may be stored as a spreadsheet reference.`);
        return false;
      }
      const errText = await response.text();
      console.warn(`Failed to rename Google Drive file ${actualDriveId} to ${newName}:`, errText);
      return false;
    }

    // Register updated name in cache
    registerDrivePhoto(actualDriveId, { 
      id: actualDriveId, 
      name: newName, 
      url: `https://lh3.googleusercontent.com/d/${actualDriveId}=w1000`, 
      directViewUrl: `https://drive.google.com/file/d/${actualDriveId}/view` 
    });
    return true;
  } catch (err) {
    console.warn(`Error renaming Google Drive file ${actualDriveId}:`, err);
    return false;
  }
}

/**
 * Normalizes diverse date formats (YYYY-MM-DD, DD/MM/YYYY, YYYY/MM/DD, etc.) strictly to canonical ISO YYYY-MM-DD.
 */
export function normalizeDateToISO(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(trimmed)) {
    const parts = trimmed.split(/[/.-]/);
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(/[/.-]/);
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Formats meal photo file names according to the clinical specification:
 * Format: {MealID}_{PhotoDescription}_{PhotoNumber}_{YYYY-MM-DD}.jpg
 * Example: M-028_Quaker_Oatmeal_With_Peanuts_photo1_2026-09-11.jpg
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

  // Format clean dish description
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

  // Multi-image index indicated as photo1, photo2, etc.
  const photoNum = (params.imageIndex !== undefined ? params.imageIndex + 1 : 1);
  const photoPart = `photo${photoNum}`;

  // Format date strictly as YYYY-MM-DD
  const datePart = normalizeDateToISO(params.dateStr);

  return `${mealId}_${cleanDish}_${photoPart}_${datePart}.jpg`;
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

  const activeFolder = getActiveDriveFolderId();
  const targetFolderId = options?.folderId || (activeFolder ? activeFolder : GOOGLE_DRIVE_FOLDER_ID);
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

  // Register in runtime photo cache for immediate local UI hydration
  registerDrivePhoto(fileId, {
    id: fileId,
    name: finalName,
    url: thumbnailUrl,
    directViewUrl: webViewLink,
    mealId: options?.mealId,
  });
  if (options?.mealId) {
    registerDrivePhoto(options.mealId, {
      id: fileId,
      name: finalName,
      url: thumbnailUrl,
      directViewUrl: webViewLink,
      mealId: options.mealId,
    });
  }

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

  const activeFolderId = folderId || getActiveDriveFolderId();
  const activeFolderName = getActiveDriveFolderName();

  try {
    let rawFiles: any[] = [];

    // 1. First attempt: Server-side proxy /api/drive/files (avoids iframe CORS/network blocks & auto-discovers Meal_log_perso)
    try {
      const serverProxyUrl = `/api/drive/files?folderId=${encodeURIComponent(activeFolderId)}&folderName=${encodeURIComponent(activeFolderName)}`;
      const proxyRes = await fetch(serverProxyUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.success && Array.isArray(proxyData.files) && proxyData.files.length > 0) {
          rawFiles = proxyData.files;
          if (proxyData.activeFolderId && !activeFolderId) {
            setActiveDriveFolder(proxyData.activeFolderId, proxyData.activeFolderName);
          }
        }
      } else {
        if (proxyRes.status === 401) {
          clearSavedToken();
          throw new Error('401_UNAUTHORIZED');
        }
      }
    } catch (proxyErr: any) {
      if (proxyErr.message === '401_UNAUTHORIZED') {
        throw proxyErr; // re-throw to abort and let UI handle it
      }
      console.warn('Server drive proxy notice:', proxyErr);
    }

    // 2. Fallback: Direct Google Drive API if server proxy returned no files
    if (rawFiles.length === 0 && activeFolderId && activeFolderId !== OBSOLETE_TEMPLATE_FOLDER_ID) {
      const query = `'${activeFolderId}' in parents and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime,description,appProperties)&orderBy=createdTime+desc&pageSize=100`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearSavedToken();
          throw new Error('401_UNAUTHORIZED');
        }
        console.warn('Could not list Google Drive files directly:', await response.text());
        return [];
      }

      const data = await response.json();
      if (data.files && Array.isArray(data.files)) {
        rawFiles = data.files;
      }
    }

    if (!Array.isArray(rawFiles) || rawFiles.length === 0) return [];

    return rawFiles
      .filter((f: any) => f.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.name))
      .map((f: any) => {
        // Parse meal id if present in appProperties or filename like "meal_M-028_photo_1.jpg" or "M-016_..."
        const appMealId = f.appProperties?.mealId;
        const mealMatch = f.name.match(/(M-\d+|KFC-\d+|Obalab-\d+)/i);
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

        const directUrl = `https://lh3.googleusercontent.com/d/${f.id}=w1000`;
        const viewUrl = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;

        // Register in runtime cache so any UI query can resolve this photo
        registerDrivePhoto(f.id, {
          id: f.id,
          name: f.name,
          url: directUrl,
          directViewUrl: viewUrl,
          mealId,
        });
        registerDrivePhoto(f.name, {
          id: f.id,
          name: f.name,
          url: directUrl,
          directViewUrl: viewUrl,
          mealId,
        });
        if (f.name.includes('.')) {
          registerDrivePhoto(f.name.replace(/\.[^/.]+$/, ''), {
            id: f.id,
            name: f.name,
            url: directUrl,
            directViewUrl: viewUrl,
            mealId,
          });
        }
        if (mealId) {
          registerDrivePhoto(mealId, {
            id: f.id,
            name: f.name,
            url: directUrl,
            directViewUrl: viewUrl,
            mealId,
          });
        }

        return {
          id: f.id,
          name: f.name,
          url: directUrl,
          directViewUrl: viewUrl,
          mealId,
          dateStr,
        };
      });
  } catch (err) {
    console.warn('Error fetching files from Google Drive:', err);
    return [];
  }
}
