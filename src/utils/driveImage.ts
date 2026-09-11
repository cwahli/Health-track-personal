/**
 * Google Drive Image & File Attachment Utility
 * Direct Google CDN streaming using lh3.googleusercontent.com/d/{FILE_ID}=w1200
 */

import { GOOGLE_DRIVE_PHOTOS, DriveFolderFile } from '../data/googleDriveFolderData';

export interface MealPhotoItem {
  url: string;
  title: string;
  driveUrl?: string;
  fileName?: string;
  fileId?: string;
}

// Dynamic cache for photos found dynamically via Drive search API or uploads
export const runtimeDrivePhotoCache = new Map<string, { id: string; url: string; directViewUrl: string; name?: string; mealId?: string }>();

export function registerDrivePhoto(key: string, data: { id: string; url: string; directViewUrl: string; name?: string; mealId?: string }) {
  if (!key) return;
  const lowerKey = key.trim().toLowerCase();
  runtimeDrivePhotoCache.set(lowerKey, data);
  if (data.id) runtimeDrivePhotoCache.set(data.id.toLowerCase(), data);
  if (data.name) runtimeDrivePhotoCache.set(data.name.trim().toLowerCase(), data);
}

export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Pattern 1: /file/d/FILE_ID/
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // Pattern 2: id=FILE_ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  // Pattern 3: /d/FILE_ID (e.g. lh3.googleusercontent.com/d/FILE_ID)
  const lh3Match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  // Pattern 4: HYPERLINK formula: =HYPERLINK("https://drive.google.com/...", "...")
  const formulaMatch = trimmed.match(/HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  if (formulaMatch && formulaMatch[1]) {
    return extractDriveFileId(formulaMatch[1]);
  }

  // If it's a raw 25-50 char alphanumeric string starting with 1
  if (/^1[a-zA-Z0-9_-]{27,45}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function formatDriveImageUrl(urlOrId?: string, mealId?: string): string | null {
  if (!urlOrId && !mealId) return null;
  const trimmed = (urlOrId || '').trim();

  // Data URLs (base64 uploads)
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // Extract from formula if present
  const formulaUrl = trimmed.match(/HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  const effectiveUrl = formulaUrl ? formulaUrl[1] : trimmed;

  const fileId = extractDriveFileId(effectiveUrl);
  if (fileId) {
    // Valid Google Drive file ID - use lh3 direct Google CDN stream
    return `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
  }

  // If standard valid web URL (and not generic stock placeholder)
  if (effectiveUrl.startsWith('http://') || effectiveUrl.startsWith('https://')) {
    if (!effectiveUrl.includes('unsplash.com')) {
      return effectiveUrl;
    }
  }

  // Check runtime cache
  if (effectiveUrl) {
    const cached = runtimeDrivePhotoCache.get(effectiveUrl.toLowerCase());
    if (cached) return cached.url;
  }
  if (mealId) {
    const cached = runtimeDrivePhotoCache.get(mealId.toLowerCase());
    if (cached) return cached.url;
  }

  // Check against static GOOGLE_DRIVE_PHOTOS registry by filename or mealId
  if (effectiveUrl || mealId) {
    const cleanEffective = effectiveUrl.toLowerCase().replace(/\.[^/.]+$/, '');
    const matched = GOOGLE_DRIVE_PHOTOS.find(p => {
      const pName = p.name.toLowerCase();
      const pNameNoExt = pName.replace(/\.[^/.]+$/, '');
      if (effectiveUrl && (pName === effectiveUrl.toLowerCase() || pNameNoExt === cleanEffective || pName.includes(cleanEffective))) {
        return true;
      }
      if (mealId && p.mealId && p.mealId.toUpperCase() === mealId.toUpperCase()) {
        return true;
      }
      if (effectiveUrl && effectiveUrl.startsWith('M-') && p.mealId && p.mealId.toUpperCase() === effectiveUrl.toUpperCase()) {
        return true;
      }
      return false;
    });

    if (matched) {
      return matched.url;
    }
  }

  return null;
}

export function getDriveDirectViewUrl(urlOrId?: string, mealId?: string): string {
  if (!urlOrId && !mealId) return '';
  const trimmed = (urlOrId || '').trim();
  const formulaUrl = trimmed.match(/HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  const effectiveUrl = formulaUrl ? formulaUrl[1] : trimmed;

  const fileId = extractDriveFileId(effectiveUrl);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  // Check runtime cache
  if (effectiveUrl && runtimeDrivePhotoCache.has(effectiveUrl.toLowerCase())) {
    return runtimeDrivePhotoCache.get(effectiveUrl.toLowerCase())!.directViewUrl;
  }
  if (mealId && runtimeDrivePhotoCache.has(mealId.toLowerCase())) {
    return runtimeDrivePhotoCache.get(mealId.toLowerCase())!.directViewUrl;
  }

  // Check static list
  const matched = GOOGLE_DRIVE_PHOTOS.find(p => {
    if (effectiveUrl && p.name.toLowerCase() === effectiveUrl.toLowerCase()) return true;
    if (mealId && p.mealId && p.mealId.toUpperCase() === mealId.toUpperCase()) return true;
    return false;
  });
  if (matched?.directViewUrl) return matched.directViewUrl;

  return effectiveUrl.startsWith('http') ? effectiveUrl : '';
}

export function isGoogleDriveUrl(url?: string): boolean {
  if (!url) return false;
  return /drive\.google\.com|docs\.google\.com|googleusercontent\.com/.test(url) || !!extractDriveFileId(url);
}

/**
 * Extracts and resolves all photos associated with a meal for full multi-photo browsing.
 */
export function getMealPhotos(meal: {
  id?: string;
  mealId?: string;
  foodName?: string;
  imageUrl?: string;
  photoUrls?: string[];
  driveFileName?: string;
  driveFileId?: string;
  driveFileIds?: string[];
}): MealPhotoItem[] {
  if (!meal) return [];

  const candidates: Array<{ ref: string; knownName?: string; knownDriveUrl?: string }> = [];

  // 1. Array of photoUrls if provided
  if (Array.isArray(meal.photoUrls)) {
    meal.photoUrls.forEach((u) => {
      if (typeof u === 'string' && u.trim()) {
        candidates.push({ ref: u.trim() });
      }
    });
  }

  // 2. Comma-separated or newline-separated imageUrl
  if (meal.imageUrl && typeof meal.imageUrl === 'string') {
    const splitUrls = meal.imageUrl
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    splitUrls.forEach((u) => {
      candidates.push({ ref: u });
    });
  }

  // 3. Array of driveFileIds
  if (Array.isArray(meal.driveFileIds)) {
    meal.driveFileIds.forEach((fid) => {
      if (typeof fid === 'string' && fid.trim()) {
        candidates.push({ ref: fid.trim() });
      }
    });
  }

  // 4. Single driveFileId
  if (meal.driveFileId && typeof meal.driveFileId === 'string' && meal.driveFileId.trim()) {
    candidates.push({ ref: meal.driveFileId.trim() });
  }

  // 5. Comma-separated driveFileName
  if (meal.driveFileName && typeof meal.driveFileName === 'string') {
    const splitNames = meal.driveFileName
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    splitNames.forEach((n) => {
      candidates.push({ ref: n, knownName: n });
    });
  }

  // 6. Match from static GOOGLE_DRIVE_PHOTOS by mealId
  if (meal.mealId) {
    const upperMealId = meal.mealId.trim().toUpperCase();
    const staticMatches = GOOGLE_DRIVE_PHOTOS.filter(
      (p) => p.mealId && p.mealId.trim().toUpperCase() === upperMealId
    );
    staticMatches.forEach((p) => {
      candidates.push({
        ref: p.url,
        knownName: p.name,
        knownDriveUrl: p.directViewUrl,
      });
    });
  }

  // 7. Match from runtimeDrivePhotoCache
  if (meal.mealId) {
    const upperMealId = meal.mealId.trim().toUpperCase();
    for (const [key, item] of runtimeDrivePhotoCache.entries()) {
      const matchesMealId = item.mealId && item.mealId.trim().toUpperCase() === upperMealId;
      const matchesKeyPrefix = key.toUpperCase().startsWith(upperMealId);
      const matchesName = item.name && item.name.toUpperCase().startsWith(upperMealId);
      if (matchesMealId || matchesKeyPrefix || matchesName) {
        candidates.push({
          ref: item.url,
          knownName: item.name,
          knownDriveUrl: item.directViewUrl,
        });
      }
    }
  }

  // Resolve and deduplicate photos
  const result: MealPhotoItem[] = [];
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();

  const baseTitle = meal.foodName || 'Meal Photo';

  candidates.forEach(({ ref, knownName, knownDriveUrl }, idx) => {
    if (!ref) return;

    const resolvedUrl = formatDriveImageUrl(ref, meal.mealId);
    if (!resolvedUrl) return;

    const fileId = extractDriveFileId(ref) || extractDriveFileId(resolvedUrl);
    if (fileId && seenIds.has(fileId.toLowerCase())) return;
    if (seenUrls.has(resolvedUrl.toLowerCase())) return;

    if (fileId) seenIds.add(fileId.toLowerCase());
    seenUrls.add(resolvedUrl.toLowerCase());

    const driveUrl = knownDriveUrl || getDriveDirectViewUrl(ref, meal.mealId) || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : undefined);

    // Derive the best human-readable file name
    let fileName = knownName;
    if (!fileName && fileId) {
      const cached = runtimeDrivePhotoCache.get(fileId.toLowerCase());
      if (cached?.name) fileName = cached.name;
      if (!fileName) {
        const staticMatch = GOOGLE_DRIVE_PHOTOS.find((p) => p.id === fileId);
        if (staticMatch?.name) fileName = staticMatch.name;
      }
    }

    if (!fileName && /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(ref)) {
      fileName = ref;
    }

    if (!fileName) {
      const cleanFoodName = (meal.foodName || 'Dish').replace(/[^a-zA-Z0-9]/g, '_');
      const mealPrefix = meal.mealId ? `${meal.mealId}_` : '';
      fileName = `${mealPrefix}${cleanFoodName}_photo${result.length + 1}.jpg`;
    }

    result.push({
      url: resolvedUrl,
      title: baseTitle,
      driveUrl,
      fileName,
      fileId: fileId || undefined,
    });
  });

  return result;
}
