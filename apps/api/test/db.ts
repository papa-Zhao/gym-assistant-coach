import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "../src/users/repo";

const migrationsFolder = fileURLToPath(
  new URL("../../../db/migrations/", import.meta.url),
);

export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder });
  return db;
}
