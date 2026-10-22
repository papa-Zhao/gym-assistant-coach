import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "../src/users/repo";
import type { Advisor } from "../src/ai/advisor";
import type { EquipmentIdentifier } from "../src/ai/equipment-identifier";
import type { MealParser } from "../src/ai/meal-parser";
import type { PhotoStore } from "../src/photos/store";

const migrationsFolder = fileURLToPath(
  new URL("../../../db/migrations/", import.meta.url),
);

export async function createTestDb(): Promise<{
  db: Db;
  close: () => Promise<void>;
  /** Statements sent to the database since the last reset. */
  statements: { count: number; reset: () => void };
}> {
  const client = new PGlite();
  const statements = { count: 0, reset: () => (statements.count = 0) };
  // Count every statement (a query, or a transaction's BEGIN/COMMIT, each once).
  const query = client.query.bind(client);
  const exec = client.exec.bind(client);
  client.query = ((...args: Parameters<typeof query>) => {
    statements.count += 1;
    return query(...args);
  }) as typeof client.query;
  client.exec = ((...args: Parameters<typeof exec>) => {
    statements.count += 1;
    return exec(...args);
  }) as typeof client.exec;
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close(), statements };
}

/** For suites that never reach the AI parser. */
export const unusedMealParser: MealParser = {
  parseText: async () => {
    throw new Error("meal parser should not be called");
  },
  parsePhoto: async () => {
    throw new Error("meal parser should not be called");
  },
};

/** For suites that never reach the equipment identifier. */
export const unusedEquipmentIdentifier: EquipmentIdentifier = {
  identify: async () => {
    throw new Error("equipment identifier should not be called");
  },
};

/** For suites that never reach the advisor. */
export const unusedAdvisor: Advisor = {
  ask: async () => {
    throw new Error("advisor should not be called");
  },
};

/** For suites that never touch meal photos. */
export const unusedPhotoStore: PhotoStore = {
  put: async () => {
    throw new Error("photo store should not be called");
  },
  signedUrl: async () => {
    throw new Error("photo store should not be called");
  },
  delete: async () => {
    throw new Error("photo store should not be called");
  },
};

/** In-memory store recording calls; set `fail` to make an operation throw. */
export function memoryPhotoStore() {
  const objects = new Map<string, Buffer>();
  const calls = { put: [] as string[], delete: [] as string[] };
  const fail = { put: false, signedUrl: false, delete: false };
  /** Calls that never settle. */
  const hang = { put: false, delete: false };
  const never = () => new Promise<never>(() => {});
  const store: PhotoStore = {
    async put(key, jpeg) {
      calls.put.push(key);
      if (hang.put) await never();
      if (fail.put) throw new Error("boom");
      objects.set(key, jpeg);
    },
    async signedUrl(key) {
      if (fail.signedUrl) throw new Error("boom");
      return `https://signed.test/${key}?sig=1`;
    },
    async delete(key) {
      calls.delete.push(key);
      if (hang.delete) await never();
      if (fail.delete) throw new Error("boom");
      objects.delete(key);
    },
  };
  return { store, objects, calls, fail, hang };
}
