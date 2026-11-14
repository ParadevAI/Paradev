import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import {
	dropUndone,
	HANDOFF_GRACE_MS,
	type MoveStatus,
	markHandingOff,
	recordMoveUndo,
	undoEndedMoves,
} from "./moveUndo";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

function setup() {
	const db = drizzle(new Database(":memory:"), {
		schema,
	}) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	recordMoveUndo(db, {
		workspaceMoveId: "move-1",
		workspaceId: "ws-1",
		stoppedTerminalIds: ["t1", "t2", "t3"],
		followedChatIds: ["c1"],
		now: 0,
	});
	const resumed: string[][] = [];
	const forgotten: string[][] = [];
	let status: MoveStatus | null = {
		status: "moving",
		hasDestination: true,
		finishedAt: null,
	};
	let failing: string[] = [];
	const run = (now: number) =>
		undoEndedMoves({
			db,
			statusOf: async () => status,
			resumeTerminals: async (_workspaceId, ids) => {
				resumed.push(ids);
				return { failed: ids.filter((id) => failing.includes(id)) };
			},
			forgetChats: (ids) => forgotten.push(ids),
			now,
		});
	return {
		db,
		resumed,
		forgotten,
		run,
		setStatus: (next: MoveStatus | null) => {
			status = next;
		},
		failOn: (ids: string[]) => {
			failing = ids;
		},
		rows: () => db.select().from(schema.workspaceMoveUndos).all(),
	};
}

describe("undoEndedMoves", () => {
	test("waits while the move runs or cannot be read, then out the handoff, then starts the rest again", async () => {
		const host = setup();
		markHandingOff(host.db, "move-1", "t2");
		dropUndone(host.db, { workspaceId: "ws-1", terminalIds: ["t3"] });

		await host.run(1_000);
		host.setStatus(null);
		await host.run(2_000);
		host.setStatus({
			status: "ready",
			hasDestination: true,
			finishedAt: 5_000,
		});
		await host.run(5_000 + HANDOFF_GRACE_MS - 1);
		expect(host.resumed).toEqual([]);

		await host.run(5_000 + HANDOFF_GRACE_MS);
		expect(host.resumed).toEqual([["t1"]]);
		expect(host.forgotten).toEqual([["c1"]]);
		expect(host.rows()).toEqual([]);
	});

	test("puts back at once a move that never got a destination, and keeps what failed to start for another try", async () => {
		const host = setup();
		host.setStatus({ status: "failed", hasDestination: false, finishedAt: 10 });
		host.failOn(["t2"]);
		await host.run(20);
		expect(host.resumed).toEqual([["t1", "t2", "t3"]]);
		expect(host.rows()[0]).toMatchObject({
			stoppedTerminalIds: ["t2"],
			followedChatIds: [],
		});

		host.failOn([]);
		await host.run(30);
		expect(host.resumed.at(-1)).toEqual(["t2"]);
		expect(host.rows()).toEqual([]);
	});

	test("gives up once its terminals can no longer start again", async () => {
		const host = setup();
		await host.run(56 * 60_000);
		expect(host.resumed).toEqual([]);
		expect(host.rows()).toEqual([]);
	});
});
