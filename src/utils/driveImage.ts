/**
 * Google Drive Image & File Attachment Utility
 * Direct Google CDN streaming using lh3.googleusercontent.com/d/{FILE_ID}=w1200
 */

import { GOOGLE_DRIVE_PHOTOS } from '../data/googleDriveFolderData';

// Dynamic cache for photos found dynamically via Drive search API
export const runtimeDrivePhotoCache = new Map<string, { id: string; url: string; directViewUrl: string }>();

export function registerDrivePhoto(key: string, data: { id: string; url: string; directViewUrl: string }) {
  if (!key) return;
  runtimeDrivePhotoCache.set(key.trim().toLowerCase(), data);
  if (data.id) runtimeDrivePhotoCache.set(data.id, data);
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
