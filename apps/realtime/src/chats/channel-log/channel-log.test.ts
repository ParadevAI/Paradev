import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import {
	append,
	ephemeral,
	HISTORY_LIMIT,
	HISTORY_MAX_AGE_MS,
	migrate,
	resume,
	type Sql,
} from "./channel-log";

const channel = "group:00000000-0000-4000-8000-000000000001";
let sql: Sql;
beforeEach(() => {
	const db = new Database(":memory:");
	sql = {
		exec: (query, ...params) =>
			db.query(query).all(...params) as Record<string, unknown>[],
	};
	migrate(sql);
});

const publish = (n: number, at = 1_000) => {
	for (let i = 0; i < n; i++)
		append(sql, channel, JSON.stringify({ type: "x", i }), at);
};

describe("a channel's log", () => {
	test("events get increasing seqs and carry the API's data", () => {
		expect(append(sql, channel, '{"type":"message.created"}', 1_000)).toEqual({
			type: "event",
			channel,
			seq: 1,
			data: { type: "message.created" },
		});
		expect(append(sql, channel, '{"type":"task.updated"}', 1_001).seq).toBe(2);
	});

	test("a new connection starts fresh at the latest seq", () => {
		publish(3);
		expect(resume(sql, channel, null, 2_000)).toEqual([
			{ type: "hello", channel, seq: 3, resumed: false },
		]);
	});

	test("a reconnecting client gets exactly what it missed, in order", () => {
		publish(5);
		const frames = resume(sql, channel, 2, 2_000);
		expect(frames[0]).toEqual({
			type: "hello",
			channel,
			seq: 5,
			resumed: true,
		});
		expect(frames.slice(1).map((f) => f.seq)).toEqual([3, 4, 5]);
		expect(frames[1]).toMatchObject({
			type: "event",
			data: { type: "x", i: 2 },
		});
	});

	test("a client that missed nothing resumes with nothing to replay", () => {
		publish(2);
		expect(resume(sql, channel, 2, 2_000)).toEqual([
			{ type: "hello", channel, seq: 2, resumed: true },
		]);
	});

	test("the history keeps the last 100 events; a gap older than that can't be resumed", () => {
		publish(HISTORY_LIMIT + 20);
		expect(resume(sql, channel, 19, 2_000)).toEqual([
			{ type: "hello", channel, seq: HISTORY_LIMIT + 20, resumed: false },
		]);
		const frames = resume(sql, channel, 20, 2_000);
		expect(frames[0]).toMatchObject({ resumed: true });
		expect(frames).toHaveLength(HISTORY_LIMIT + 1);
	});

	test("events older than a day are dropped, but a client that saw the latest seq still resumes", () => {
		publish(3, 1_000);
		const later = 1_000 + HISTORY_MAX_AGE_MS + 1;
		expect(resume(sql, channel, 1, later)).toEqual([
			{ type: "hello", channel, seq: 3, resumed: false },
		]);
		expect(resume(sql, channel, 3, later)).toEqual([
			{ type: "hello", channel, seq: 3, resumed: true },
		]);
		expect(append(sql, channel, "{}", later).seq).toBe(4);
	});

	test("an ephemeral event is neither stored nor replayed, and carries the latest seq without moving it", () => {
		publish(2);
		expect(ephemeral(sql, channel, '{"type":"typing"}')).toEqual({
			type: "event",
			channel,
			seq: 2,
			data: { type: "typing" },
			ephemeral: true,
		});
		expect(resume(sql, channel, 1, 2_000).map((f) => f.seq)).toEqual([2, 2]);
		expect(append(sql, channel, "{}", 2_000).seq).toBe(3);
	});

	test("a seq the channel never reached (it lost its storage) means start over", () => {
		publish(2);
		expect(resume(sql, channel, 7, 2_000)).toEqual([
			{ type: "hello", channel, seq: 2, resumed: false },
		]);
	});
});
