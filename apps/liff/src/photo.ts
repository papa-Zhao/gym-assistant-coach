export const PHOTO_MAX_SIDE = 1024;

/** Scales (w, h) to fit within max on the long side; never enlarges; integer results >= 1. */
export function fitWithin(
  w: number,
  h: number,
  max: number = PHOTO_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export class PhotoReadError extends Error {
  constructor(message = "Cannot read photo") {
    super(message);
    this.name = "PhotoReadError";
  }
}

/**
 * Decodes with EXIF orientation, draws onto a canvas at fitWithin size and
 * returns a JPEG (quality 0.8). Throws PhotoReadError on any failure.
 */
export async function resizePhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
    } catch (err) {
      // Older WebKit / Android WebViews reject the option value.
      if (!(err instanceof TypeError)) throw err;
      bitmap = await createImageBitmap(file);
    }
  } catch {
    throw new PhotoReadError();
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoReadError();
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    if (!blob) throw new PhotoReadError();
    return blob;
  } catch (err) {
    throw err instanceof PhotoReadError ? err : new PhotoReadError();
  } finally {
    bitmap.close();
  }
}
