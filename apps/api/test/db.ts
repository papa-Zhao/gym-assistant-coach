import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "../src/users/repo";
import type { MealParser } from "../src/ai/meal-parser";

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
};
