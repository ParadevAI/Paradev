import path from "node:path";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { env } from "./env";
import { configureLocalProxy, isLocalProxy } from "./local-proxy";

/**
 * Applies migrations to the local Docker stack through neon-proxy.
 * `drizzle-kit migrate` cannot: no TCP Postgres driver is installed, so it
 * falls back to Neon's websocket driver, which reaches only remote Neon.
 *
 * Usage: bun run db:migrate:local
 */
async function migrateLocal(): Promise<void> {
	if (!isLocalProxy(env.DATABASE_URL)) {
		throw new Error(
			"DATABASE_URL is not the local proxy (db.localtest.me). Use `bun run db:migrate` for a Neon database.",
		);
	}
	configureLocalProxy();

	const pool = new Pool({ connectionString: env.DATABASE_URL });
	try {
		await migrate(drizzle({ client: pool }), {
			migrationsFolder: path.resolve(__dirname, "../drizzle"),
		});
	} finally {
		await pool.end();
	}
	console.log("Local database is migrated");
}

migrateLocal().catch((error) => {
	console.error(error);
	process.exit(1);
});
