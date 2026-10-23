import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

/** Deadline for each GCS put/delete, so a slow bucket cannot outlast the bot's 30 s timeout. */
export const PHOTO_STORE_TIMEOUT_MS = 5_000;

/**
 * Rejects after `ms` even if `run` never settles. The timer is cleared as soon
 * as the call settles.
 */
export async function withPhotoDeadline<T>(
  run: () => Promise<T>,
  ms: number = PHOTO_STORE_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("photo store deadline");
      err.name = "PhotoStoreTimeout";
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([run(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export interface PhotoStore {
  put(key: string, jpeg: Buffer): Promise<void>;
  /** V4 read URL valid for 5 minutes. */
  signedUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}

export function createGcsPhotoStore(bucket: string): PhotoStore {
  const gcsBucket = new Storage().bucket(bucket);
  return {
    async put(key, jpeg) {
      await gcsBucket.file(key).save(jpeg, {
        contentType: "image/jpeg",
        resumable: false,
        timeout: PHOTO_STORE_TIMEOUT_MS,
      });
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
    async deletePrefix(prefix) {
      await withPhotoDeadline(() => gcsBucket.deleteFiles({ prefix }));
    },
  };
}

/** Key prefix of all of a user's meal photos. */
export function mealPhotoPrefix(userId: string): string {
  return `meals/${userId}/`;
}

export function newMealPhotoKey(userId: string): string {
  return `${mealPhotoPrefix(userId)}${randomUUID()}.jpg`;
}
