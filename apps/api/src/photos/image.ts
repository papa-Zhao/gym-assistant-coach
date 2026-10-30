import sharp from "sharp";

export class InvalidImage extends Error {}

const MAX_EDGE = 1024;
const JPEG_QUALITY = 80;
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Rotates by EXIF, fits within 1024x1024, re-encodes JPEG q80 with no
 * metadata (sharp drops EXIF/GPS/ICC unless asked to keep them). Throws
 * InvalidImage; the sharp error text is never propagated.
 */
export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch {
    throw new InvalidImage("image could not be read");
  }
}

export const THUMB_EDGE = 192;
export const THUMB_MAX_BYTES = 32 * 1024;
const THUMB_QUALITY = 70;
const THUMB_FALLBACK_QUALITY = 50;

/**
 * 192x192 center-cropped JPEG (q70, retried at q50 when over
 * THUMB_MAX_BYTES), no metadata. Throws InvalidImage; the sharp error text is
 * never propagated.
 */
export async function makeThumbnail(image: Buffer): Promise<Buffer> {
  try {
    const base = sharp(image, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "cover" });
    let out = await base.clone().jpeg({ quality: THUMB_QUALITY }).toBuffer();
    if (out.length > THUMB_MAX_BYTES) {
      out = await base
        .clone()
        .jpeg({ quality: THUMB_FALLBACK_QUALITY })
        .toBuffer();
    }
    if (out.length > THUMB_MAX_BYTES) throw new Error("thumbnail too large");
    return out;
  } catch {
    throw new InvalidImage("image could not be read");
  }
}
