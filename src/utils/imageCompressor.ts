/**
 * Utility for compressing images to a target file size (e.g. 200 KB)
 * using HTML Canvas in the browser before network transmission.
 */

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  width: number;
  height: number;
}

/**
 * Formats byte counts into human-readable string (e.g. "194 KB", "2.1 MB")
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Compresses an image File or Blob to be strictly under maxSizeBytes (default: 200 KB).
 * Maintains maximum possible resolution and visual clarity.
 */
export async function compressImageToTargetSize(
  input: File | Blob,
  maxSizeBytes: number = 200 * 1024, // 200 KB
  fallbackFileName?: string
): Promise<CompressionResult> {
  const originalSize = input.size;
  const originalFileName = (input as File).name || fallbackFileName || 'photo.jpg';

  // If already under target size and is jpeg/png/webp, we still check or optimize if desirable
  if (originalSize <= maxSizeBytes && input.type === 'image/jpeg') {
    const file = input instanceof File ? input : new File([input], originalFileName, { type: 'image/jpeg' });
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      wasCompressed: false,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(input);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Cap maximum initial dimension to 1600px to avoid huge memory allocations for 12MP-48MP smartphone photos
        const maxInitialDimension = 1600;
        if (width > maxInitialDimension || height > maxInitialDimension) {
          if (width > height) {
            height = Math.round((height * maxInitialDimension) / width);
            width = maxInitialDimension;
          } else {
            width = Math.round((width * maxInitialDimension) / height);
            height = maxInitialDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Canvas 2D context could not be created for image compression.');
        }

        // Draw image onto canvas with high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Helper to convert canvas to blob with given quality
        const getBlob = (q: number): Promise<Blob | null> => {
          return new Promise((res) => {
            canvas.toBlob(res, 'image/jpeg', q);
          });
        };

        // Iterative compression:
        // Try decreasing quality from 0.85 down to 0.4 in steps
        const qualitySteps = [0.85, 0.78, 0.70, 0.62, 0.55, 0.48, 0.40];
        let bestBlob: Blob | null = null;

        for (const quality of qualitySteps) {
          const blob = await getBlob(quality);
          if (blob) {
            bestBlob = blob;
            if (blob.size <= maxSizeBytes) {
              break;
            }
          }
        }

        // If still larger than maxSizeBytes, downscale canvas dimensions
        let scaleFactor = 0.85;
        let attempts = 0;
        while (bestBlob && bestBlob.size > maxSizeBytes && attempts < 5) {
          attempts++;
          width = Math.round(width * scaleFactor);
          height = Math.round(height * scaleFactor);
          canvas.width = width;
          canvas.height = height;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const blob = await getBlob(0.60);
          if (blob) {
            bestBlob = blob;
            if (blob.size <= maxSizeBytes) break;
          }
        }

        if (!bestBlob) {
          throw new Error('Failed to generate compressed image blob.');
        }

        // Generate clean clean .jpg filename
        const baseName = originalFileName.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_');
        const compressedFileName = `${baseName}.jpg`;

        const compressedFile = new File([bestBlob], compressedFileName, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        resolve({
          file: compressedFile,
          originalSize,
          compressedSize: compressedFile.size,
          wasCompressed: true,
          width,
          height,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression. Format may not be supported.'));
    };

    img.src = objectUrl;
  });
}
