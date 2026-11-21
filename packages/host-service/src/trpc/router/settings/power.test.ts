import { Database } from "bun:sqlite";
import { afterEach, expect, mock, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { powerRouter } from "./power";

const databases: Database[] = [];

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

function setup(overrides: Partial<HostServiceContext> = {}, supported = true) {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema });
	migrate(db, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	const setEnabled = mock(() => {});
	const ctx = {
		db: db as unknown as HostDb,
		isAuthenticated: true,
		isLocalCaller: true,
		runtime: { keepAwake: { supported, setEnabled, stop() {} } },
		...overrides,
	} as HostServiceContext;
	return { sqlite, db, caller: powerRouter.createCaller(ctx), setEnabled };
}

test("reading an unset preference returns off without creating a blank settings row", async () => {
	const { caller, db } = setup();
	expect(await caller.get()).toEqual({ enabled: false, supported: true });
	expect(db.select().from(schema.hostSettings).all()).toHaveLength(0);
});

test("saving a preference preserves other host settings and updates the controller", async () => {
	const { caller, db, setEnabled } = setup();
	db.insert(schema.hostSettings)
		.values({ id: 1, worktreeBaseDir: "/existing/worktrees" })
		.run();
	expect(await caller.set({ enabled: true })).toEqual({ enabled: true });
	expect(await caller.get()).toEqual({ enabled: true, supported: true });
	expect(db.select().from(schema.hostSettings).get()?.worktreeBaseDir).toBe(
		"/existing/worktrees",
	);
	expect(setEnabled).toHaveBeenCalledWith(true);
});

test("the first power write preserves the legacy worktree path", async () => {
	const previous = process.env.SUPERSET_LEGACY_WORKTREE_BASE_DIR;
	process.env.SUPERSET_LEGACY_WORKTREE_BASE_DIR = "/legacy/worktrees";
	try {
		const { caller, db } = setup();
		await caller.set({ enabled: true });
		expect(db.select().from(schema.hostSettings).get()?.worktreeBaseDir).toBe(
			"/legacy/worktrees",
		);
	} finally {
		if (previous === undefined)
			delete process.env.SUPERSET_LEGACY_WORKTREE_BASE_DIR;
		else process.env.SUPERSET_LEGACY_WORKTREE_BASE_DIR = previous;
	}
});

test("relay callers cannot read or change this computer's power preference", async () => {
	const { caller, setEnabled, db } = setup({ isLocalCaller: false });
	await expect(caller.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
	await expect(caller.set({ enabled: true })).rejects.toMatchObject({
		code: "FORBIDDEN",
	});
	expect(setEnabled).not.toHaveBeenCalled();
	expect(db.select().from(schema.hostSettings).all()).toHaveLength(0);
});

test("unauthenticated callers cannot enable keep-awake", async () => {
	const { caller } = setup({ isAuthenticated: false });
	await expect(caller.set({ enabled: true })).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
});

test("unsupported hosts reject enabling but allow clearing an old preference", async () => {
	const { caller, db, setEnabled } = setup({}, false);
	await expect(caller.set({ enabled: true })).rejects.toMatchObject({
		code: "PRECONDITION_FAILED",
	});
	expect(db.select().from(schema.hostSettings).all()).toHaveLength(0);
	await caller.set({ enabled: false });
	expect(setEnabled).toHaveBeenCalledWith(false);
});
