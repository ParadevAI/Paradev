import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import { backfillLegacyAwakeStatus } from "./backfill-status";
import * as sandboxExpiry from "./sandbox-expiry";

const NOW = Date.now();
const dialect = new PgDialect();

let selects: unknown[][];
let listings: number;
let awake: [string, { expiresAt: Date; sessionId: string | null }][];
let asleepWrites: { sql: string; params: unknown[] }[];

const chain = () => ({
	from: () => ({ where: async () => selects.shift() ?? [] }),
});
stub(db, {
	select: chain,
	execute: async (query: SQL) => {
		const rendered = dialect.sqlToQuery(query);
		asleepWrites.push({ sql: rendered.sql, params: rendered.params });
		return {
			rows: [{ organization_id: "org_1" }, { organization_id: "org_1" }],
		};
	},
});
stub(sandbox, {
	listAllSandboxes: async () => {
		listings += 1;
		return [
			{
				name: "box-running",
				expiresAt: new Date(NOW + 60_000),
				sessionId: "session_run",
				settling: false,
			},
			{
				name: "box-stopped",
				expiresAt: null,
				sessionId: "session_old",
				settling: false,
			},
			{
				name: "box-starting",
				expiresAt: null,
				sessionId: null,
				settling: true,
			},
		];
	},
});
stub(sandboxExpiry, {
	recordSandboxAwake: async (
		id: string,
		session: { expiresAt: Date; sessionId: string | null },
	) => {
		awake.push([id, session]);
	},
});
stub(realtime, { nudge: () => {} });

beforeEach(() => {
	listings = 0;
	awake = [];
	asleepWrites = [];
});

describe("backfillLegacyAwakeStatus", () => {
	test("classifies every ready row from the full listing, and writes asleep only over rows still at ready", async () => {
		selects = [
			[
				{ id: "ws_running", providerSandboxId: "box-running" },
				{ id: "ws_stopped", providerSandboxId: "box-stopped" },
				{ id: "ws_missing", providerSandboxId: "box-gone" },
				{ id: "ws_starting", providerSandboxId: "box-starting" },
			],
			[{ value: 1 }],
		];
		expect(await backfillLegacyAwakeStatus()).toEqual({
			ready: 4,
			awake: 1,
			asleep: 2,
			missing: 1,
			settling: 1,
			remaining: 1,
		});
		expect(awake).toEqual([
			[
				"ws_running",
				{ expiresAt: new Date(NOW + 60_000), sessionId: "session_run" },
			],
		]);
		const [write] = asleepWrites;
		expect(asleepWrites).toHaveLength(1);
		expect(write?.sql).toContain(`"cloud_workspaces"."status" = 'ready'`);
		expect(write?.params).toEqual([
			"ws_stopped",
			"session_old",
			"ws_missing",
			null,
		]);
	});

	test("does nothing, and lists nothing, once no row is at ready", async () => {
		selects = [[]];
		expect((await backfillLegacyAwakeStatus()).remaining).toBe(0);
		expect(listings).toBe(0);
		expect(asleepWrites).toEqual([]);
	});
});
