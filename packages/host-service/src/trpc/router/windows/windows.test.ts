import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { insertLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { windowsRouter } from "./windows";

let bridgeReply: { status: number; body: unknown } = {
	status: 200,
	body: { windows: [] },
};
const bridge = Bun.serve({
	port: 0,
	fetch: () => Response.json(bridgeReply.body, { status: bridgeReply.status }),
});
afterAll(() => bridge.stop(true));

const sqlite = new Database(":memory:");
const bunDb = drizzle(sqlite, { schema });
migrate(bunDb, {
	migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
});
const db = bunDb as unknown as HostDb;
const eventBus = { broadcastWorkspaceChanged: () => {} };
insertLocalWorkspace(
	{ db, eventBus: eventBus as unknown as HostServiceContext["eventBus"] },
	{
		id: "ws-1",
		projectId: null,
		worktreePath: "/tmp/ws-1",
		branch: "fix-login",
		name: "fix-login",
	},
);

const ctx = {
	isAuthenticated: true,
	browserBridge: { url: bridge.url.origin, secret: "s" },
	db,
} as unknown as HostServiceContext;

const window = {
	focused: true,
	lastFocused: true,
	visible: true,
	view: "workspace",
	route: "/v2-workspace/ws-1",
};

describe("windows.list", () => {
	test("names the workspaces this host has", async () => {
		bridgeReply = {
			status: 200,
			body: {
				windows: [
					{ ...window, id: 1, workspaceId: "ws-1" },
					{ ...window, id: 2, workspaceId: "cloud-1" },
					{ ...window, id: 3, view: "other", workspaceId: null },
				],
			},
		};
		const { windows } = await windowsRouter.createCaller(ctx).list();
		expect(windows.map((w) => w.workspaceName)).toEqual([
			"fix-login",
			null,
			null,
		]);
	});

	test("a desktop app without the route is reported as too old", async () => {
		bridgeReply = { status: 404, body: {} };
		await expect(windowsRouter.createCaller(ctx).list()).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	});
});
