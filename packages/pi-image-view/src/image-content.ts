import fsp from 'node:fs/promises';
import type { ImageContent } from './content.ts';
import { debugLog } from './debug.ts';
import { inferMimeType } from './path-utils.ts';

export type ImageResizer = (image: ImageContent) => Promise<ImageContent>;

/** Maximum image file size in bytes (50 MB). Files larger than this are skipped to prevent OOM. */
const MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024;

/** Load a supported image without blocking the editor polling loop. */
export async function loadImage(filePath: string): Promise<ImageContent | null> {
  const mimeType = inferMimeType(filePath);
  if (!mimeType) return null;

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_IMAGE_FILE_SIZE) {
      debugLog(
        `Skipping image ${filePath}: file size ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_IMAGE_FILE_SIZE / 1024 / 1024}MB limit`,
      );
      return null;
    }
  } catch (err) {
    debugLog(`Failed to stat image file ${filePath}`, err);
    return null;
  }

  try {
    const bytes = await fsp.readFile(filePath);
    return {
      type: 'image',
      data: bytes.toString('base64'),
      mimeType,
    };
  } catch (err) {
    debugLog(`Failed to read image file ${filePath}`, err);
    return null;
  }
}
