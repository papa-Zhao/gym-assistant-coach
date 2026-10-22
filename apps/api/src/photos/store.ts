import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

export interface PhotoStore {
  put(key: string, jpeg: Buffer): Promise<void>;
  /** V4 read URL valid for 5 minutes. */
  signedUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export function createGcsPhotoStore(bucket: string): PhotoStore {
  const gcsBucket = new Storage().bucket(bucket);
  return {
    async put(key, jpeg) {
      await gcsBucket
        .file(key)
        .save(jpeg, { contentType: "image/jpeg", resumable: false });
    },
    async signedUrl(key) {
      const [url] = await gcsBucket.file(key).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 5 * 60_000,
      });
      return url;
    },
    async delete(key) {
      await gcsBucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}

export function newMealPhotoKey(userId: string): string {
  return `meals/${userId}/${randomUUID()}.jpg`;
}
