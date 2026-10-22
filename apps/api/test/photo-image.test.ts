import { randomBytes } from "node:crypto";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidImage, normalizeMealImage } from "../src/photos/image.js";
import { newMealPhotoKey } from "../src/photos/store.js";

function solid(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 80, b: 40 },
    },
  });
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A PNG header declaring 30000x30000 with no pixel data. */
function hugePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(30000, 0);
  ihdr.writeUInt32BE(30000, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("normalizeMealImage", () => {
  it("fits a large JPEG within 1024x1024", async () => {
    const out = await normalizeMealImage(
      await solid(2000, 1500).jpeg().toBuffer(),
    );
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1024, 768, "jpeg"]);
  });

  it("applies EXIF orientation and strips all metadata", async () => {
    const input = await solid(600, 400)
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "25/1 3/1 0/1" } },
      })
      .toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const out = await normalizeMealImage(input);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([400, 600]);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("does not upscale and converts PNG to JPEG", async () => {
    const out = await normalizeMealImage(
      await solid(300, 200).png().toBuffer(),
    );
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([300, 200, "jpeg"]);
  });

  it("rejects empty, non-image and truncated input", async () => {
    const jpeg = await sharp(randomBytes(800 * 600 * 3), {
      raw: { width: 800, height: 600, channels: 3 },
    })
      .jpeg()
      .toBuffer();
    for (const bad of [
      Buffer.alloc(0),
      Buffer.from("hello"),
      jpeg.subarray(0, Math.floor(jpeg.length / 2)),
    ]) {
      await expect(normalizeMealImage(bad)).rejects.toBeInstanceOf(
        InvalidImage,
      );
    }
  });

  it("rejects an image over the pixel limit", async () => {
    await expect(normalizeMealImage(hugePng())).rejects.toBeInstanceOf(
      InvalidImage,
    );
  });
});

describe("newMealPhotoKey", () => {
  it("has the expected shape and is unique", () => {
    const a = newMealPhotoKey("u1");
    expect(a).toMatch(/^meals\/u1\/[0-9a-f-]{36}\.jpg$/);
    expect(newMealPhotoKey("u1")).not.toBe(a);
  });
});
