import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import type { EventBus } from "../events";
import type { ApiClient } from "../types";
import { insertLocalWorkspace } from "./local-workspace-store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const originalDoNotTrack = process.env.DO_NOT_TRACK;

afterEach(() => {
	if (originalDoNotTrack === undefined) delete process.env.DO_NOT_TRACK;
	else process.env.DO_NOT_TRACK = originalDoNotTrack;
});

test("a desktop that turned usage data off gets no workspace event from this host", async () => {
	delete process.env.DO_NOT_TRACK;
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const captured: string[] = [];
	const api = {
		analytics: {
			captureEvent: {
				mutate: async (input: { properties: { workspace_id: string } }) => {
					captured.push(input.properties.workspace_id);
				},
			},
		},
	} as unknown as ApiClient;
	const ctx = {
		db: db as unknown as HostDb,
		eventBus: { broadcastWorkspaceChanged: () => {} } as unknown as EventBus,
		api,
		organizationId: "org-1",
		clientMachineId: "remote-desktop",
	};
	const values = (id: string) => ({
		id,
		projectId: null,
		worktreePath: `/tmp/${id}`,
		branch: id,
		name: id,
	});

	insertLocalWorkspace(
		{ ...ctx, telemetryOff: true },
		values("11111111-1111-4111-8111-111111111111"),
	);
	insertLocalWorkspace(ctx, values("22222222-2222-4222-8222-222222222222"));
	await Promise.resolve();

	expect(captured).toEqual(["22222222-2222-4222-8222-222222222222"]);
});
