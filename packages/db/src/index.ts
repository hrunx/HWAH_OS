import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema.js";

export { schema };
export { seedDb } from "./seed.js";

export type DbClient = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 10,
    prepare: false,
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

declare global {
  // eslint-disable-next-line no-var
  var __paosDb: DbClient | undefined;
}

export function getDb() {
  if (globalThis.__paosDb) return globalThis.__paosDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const created = createDb(connectionString);
  globalThis.__paosDb = created;
  return created;
}



