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
