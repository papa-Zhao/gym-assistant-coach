import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoReadError, fitWithin, resizePhoto } from "./photo";

describe("fitWithin", () => {
  it("scales landscape to 1024 on the long side", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
  });

  it("scales portrait to 1024 on the long side", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 });
  });

  it("never enlarges", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("keeps each side at least 1", () => {
    expect(fitWithin(5000, 1)).toEqual({ width: 1024, height: 1 });
  });
});

describe("resizePhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubCanvas(toBlobResult: Blob | null) {
    const drawImage = vi.fn();
    const toBlob = vi.fn(
      (cb: BlobCallback, type?: string, quality?: number) => {
        void type;
        void quality;
        cb(toBlobResult);
      },
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob,
    };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas"
        ? canvas
        : realCreate(tag)) as typeof document.createElement);
    return { canvas, drawImage, toBlob };
  }

  it("throws PhotoReadError when decoding fails", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("bad");
      }),
    );
    await expect(resizePhoto(new Blob(["x"]))).rejects.toBeInstanceOf(
      PhotoReadError,
    );
  });

  it("retries without options when the first call throws TypeError", async () => {
    const close = vi.fn();
    const create = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("bad enum"))
      .mockResolvedValueOnce({ width: 100, height: 100, close });
    vi.stubGlobal("createImageBitmap", create);
    const jpeg = new Blob(["j"], { type: "image/jpeg" });
    stubCanvas(jpeg);
    await expect(resizePhoto(new Blob(["x"]))).resolves.toBe(jpeg);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]).toHaveLength(1);
  });

  it("throws PhotoReadError without retry on a non-TypeError rejection", async () => {
    const create = vi.fn().mockRejectedValue(new Error("bad"));
    vi.stubGlobal("createImageBitmap", create);
    await expect(resizePhoto(new Blob(["x"]))).rejects.toBeInstanceOf(
      PhotoReadError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("throws PhotoReadError when the retry also fails", async () => {
    const create = vi.fn().mockRejectedValue(new TypeError("bad"));
    vi.stubGlobal("createImageBitmap", create);
    await expect(resizePhoto(new Blob(["x"]))).rejects.toBeInstanceOf(
      PhotoReadError,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws PhotoReadError and closes the bitmap when toBlob returns null", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 100, height: 100, close })),
    );
    stubCanvas(null);
    await expect(resizePhoto(new Blob(["x"]))).rejects.toBeInstanceOf(
      PhotoReadError,
    );
    expect(close).toHaveBeenCalled();
  });

  it("draws at the fitted size and returns a JPEG blob", async () => {
    const close = vi.fn();
    const create = vi.fn(async () => ({ width: 4032, height: 3024, close }));
    vi.stubGlobal("createImageBitmap", create);
    const jpeg = new Blob(["j"], { type: "image/jpeg" });
    const { canvas, drawImage, toBlob } = stubCanvas(jpeg);
    const input = new Blob(["x"]);
    const out = await resizePhoto(input);
    expect(out).toBe(jpeg);
    expect(out.type).toBe("image/jpeg");
    expect(create).toHaveBeenCalledWith(input, {
      imageOrientation: "from-image",
    });
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 768);
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.8,
    );
    expect(close).toHaveBeenCalled();
  });
});
