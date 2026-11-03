import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { type AcpUpdate, AgentSessionLog, type Sql } from "./AgentSessionLog";

function sqlOf(db: Database): Sql {
	return {
		exec<T>(query: string, ...bindings: unknown[]) {
			const rows = db.query(query).all(...(bindings as never[])) as T[];
			return { toArray: () => rows };
		},
	};
}

function newLog(db = new Database(":memory:")) {
	const log = new AgentSessionLog(
		sqlOf(db),
		(fn) => db.transaction(fn)(),
		"s1",
		() => 1_000,
	);
	return { db, log };
}

const toolStart: AcpUpdate = {
	sessionUpdate: "tool_call_update",
	toolCallId: "call_1",
	name: "bash",
	title: "bun test",
	kind: "execute",
	status: "in_progress",
	rawInput: { command: "bun test" },
};
const toolEnd: AcpUpdate = {
	sessionUpdate: "tool_call_update",
	toolCallId: "call_1",
	status: "completed",
	content: [{ type: "content", content: { type: "text", text: "12 pass" } }],
};

describe("AgentSessionLog", () => {
	it("appends each step once and maps ACP updates to chat-v3 events", () => {
		const { log } = newLog();
		const first = log.append({
			stepKey: "t1/start",
			turnId: "t1",
			turnStart: { startedAtMs: 1_000 },
			acp: [toolStart],
			transcript: [{ role: "user", content: "run the tests" }],
		});
		expect(first.duplicate).toBe(false);
		expect(first.envelopes.map((e) => e.event.type)).toEqual([
			"turn",
			"session",
			"item",
		]);
		expect(
			log.append({ stepKey: "t1/start", turnId: "t1", acp: [toolStart] })
				.duplicate,
		).toBe(true);

		const second = log.append({
			stepKey: "t1/tool",
			turnId: "t1",
			acp: [toolEnd],
		});
		const item = second.envelopes.find((e) => e.event.type === "item");
		expect(item?.event).toMatchObject({
			type: "item",
			item: { kind: "tool_call", title: "bun test", status: "completed" },
		});
		expect(log.transcript()).toEqual([
			{
				seq: 1,
				stepKey: "t1/start",
				entry: { role: "user", content: "run the tests" },
			},
		]);
		expect(log.transcript({ stepKey: "t1/start" })).toHaveLength(1);
		expect(log.transcript({ stepKey: "t1/missing" })).toEqual([]);
	});

	it("rebuilds the open turn from stored ACP rows after the object restarts", () => {
		const { db, log } = newLog();
		log.append({
			stepKey: "a",
			turnId: "t1",
			turnStart: { startedAtMs: 1_000 },
			acp: [toolStart],
		});

		const restarted = newLog(db).log;
		const out = restarted.append({
			stepKey: "b",
			turnId: "t1",
			acp: [toolEnd],
		});
		const item = out.envelopes.find((e) => e.event.type === "item");
		expect(item?.event).toMatchObject({
			item: { title: "bun test", toolName: "bash", status: "completed" },
		});
	});

	it("serves events after a cursor and resets on a cursor from another epoch", () => {
		const { log } = newLog();
		log.append({
			stepKey: "a",
			turnId: "t1",
			turnStart: { startedAtMs: 1_000 },
			acp: [toolStart],
		});
		const all = log.eventsSince(null);
		if ("reset" in all) throw new Error("unexpected reset");
		expect(all.envelopes).toHaveLength(3);
		const last = all.envelopes.at(-1)?.cursor;
		if (!last) throw new Error("no cursor");
		log.append({ stepKey: "b", turnId: "t1", acp: [toolEnd] });
		const after = log.eventsSince(last);
		if ("reset" in after) throw new Error("unexpected reset");
		expect(after.envelopes.map((e) => e.cursor.seq)).toEqual([last.seq + 1]);
		expect(log.eventsSince({ epoch: "other", seq: 0 })).toEqual({
			reset: "epoch_changed",
		});
	});

	it("pages backwards from the newest event and reports the session head", () => {
		const { log } = newLog();
		expect(log.head()).toMatchObject({ cursor: null, session: null });
		log.append({
			stepKey: "a",
			turnId: "t1",
			turnStart: { startedAtMs: 1_000 },
			acp: [toolStart],
		});
		log.append({ stepKey: "b", turnId: "t1", acp: [toolEnd] });
		const newest = log.eventsBefore(null, 2);
		if ("reset" in newest) throw new Error("unexpected reset");
		expect(newest.envelopes.map((e) => e.cursor.seq)).toEqual([3, 4]);
		expect(newest.nextBefore?.seq).toBe(3);
		const older = log.eventsBefore(newest.nextBefore, 2);
		if ("reset" in older) throw new Error("unexpected reset");
		expect(older.envelopes.map((e) => e.cursor.seq)).toEqual([1, 2]);
		expect(older.nextBefore).toBeNull();
		expect(log.head()).toMatchObject({
			cursor: { seq: 4 },
			session: { status: "running", queueControls: false },
		});
	});
});
