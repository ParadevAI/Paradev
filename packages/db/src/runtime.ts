import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { drizzle } from "drizzle-orm/pglite";
import { z } from "zod";
import { migrateDatabase } from "./migrate";
import * as schema from "./schema";

const absolutePath = z
	.string()
	.min(1)
	.refine(isAbsolute, "Must be an absolute path");
export const databaseSettingsSchema = z.object({
	SUPERESTSET_DATA_DIR: absolutePath,
	SUPERESTSET_MIGRATIONS_DIR: absolutePath,
});
export type DatabaseSettings = z.infer<typeof databaseSettingsSchema>;

export async function openDatabase(settings: DatabaseSettings) {
	const dataDir = join(settings.SUPERESTSET_DATA_DIR, "metadata");
	await mkdir(dataDir, { recursive: true, mode: 0o700 });
	const client = new PGlite(dataDir, { extensions: { pg_trgm, unaccent } });
	try {
		await client.waitReady;
		const migrations = await migrateDatabase(
			client,
			settings.SUPERESTSET_MIGRATIONS_DIR,
		);
		return {
			database: drizzle({ client, schema, casing: "snake_case" }),
			migrations,
			close: () => client.close(),
		};
	} catch (error) {
		await client.close();
		throw error;
	}
}
export type DatabaseOwner = Awaited<ReturnType<typeof openDatabase>>;
