import { describe, expect, test } from "bun:test";
import type { Message, TriggerBatch } from "../model/model.ts";
import {
	formatDay,
	itemHolds,
	threadTimeLabel,
	toThreadItems,
} from "./message-groups.ts";

const msg = (
	id: string,
	at: Date,
	authorId: string | null = "u1",
): Message => ({
	id,
	chatId: "me",
	authorId,
	text: id,
	at: at.toISOString(),
});

const describeItem = (i: ReturnType<typeof toThreadItems>[number]) =>
	i.kind === "day"
		? `day:${i.date}`
		: i.kind === "time"
			? i.key
			: i.kind === "events"
				? `events:${i.count}:${i.toolkits.join("+")}`
				: i.kind === "call"
					? `call:${i.durationMs ?? "live"}:${i.messages.map((m) => m.id).join("+")}`
					: `${i.message.id}:${i.first}`;
const runs = (items: ReturnType<typeof toThreadItems>) =>
	items.flatMap((i) =>
		i.kind === "message"
			? [
					`${i.message.id}:${i.first ? "first" : ""}${i.first && i.last ? "+" : ""}${i.last ? "last" : ""}`,
				]
			: [],
	);

describe("toThreadItems", () => {
	test("a sent message keeps its row's key when the server's copy replaces the optimistic one", () => {
		const at = new Date(2026, 9, 8, 9, 0);
		const earlier = msg("a", new Date(2026, 9, 8, 7, 0));
		// Optimistic: its id is the clientId. Confirmed: the server's id, carrying the same clientId.
		const sending = toThreadItems([
			earlier,
			{ ...msg("client-1", at), clientId: "client-1" },
		]);
		const confirmed = toThreadItems([
			earlier,
			{ ...msg("srv-9", at), clientId: "client-1" },
		]);
		expect(confirmed.map((i) => i.key)).toEqual(sending.map((i) => i.key));
		// Without a clientId (a Dev's message, an older server) the id is the key.
		expect(toThreadItems([earlier]).at(-1)?.key).toBe("a");
	});

	test("adds a separator per day and groups one author's burst", () => {
		const items = toThreadItems([
			msg("a", new Date(2026, 9, 7, 22, 0)),
			msg("b", new Date(2026, 9, 8, 9, 0)),
			msg("c", new Date(2026, 9, 8, 9, 2)),
			msg("d", new Date(2026, 9, 8, 9, 20)),
			msg("e", new Date(2026, 9, 8, 9, 21), null),
		]);
		expect(items.map(describeItem)).toEqual([
			"day:2026-10-07",
			"a:true",
			"day:2026-10-08",
			"b:true",
			"c:false",
			"d:true",
			"e:true",
		]);
	});

	test("marks where each run starts and ends; a lone message is both", () => {
		const at = (min: number) => new Date(2026, 9, 8, 9, min);
		const items = toThreadItems([
			msg("a", at(0)),
			msg("b", at(1)),
			msg("c", at(2)),
			msg("d", at(3), "u2"),
			msg("e", at(4)),
		]);
		expect(runs(items)).toEqual([
			"a:first",
			"b:",
			"c:last",
			"d:first+last",
			"e:first+last",
		]);
	});

	test("the day's line carries the time of what opens it", () => {
		const opening = new Date(2026, 9, 8, 9, 41);
		expect(toThreadItems([msg("a", opening)])[0]).toMatchObject({
			kind: "day",
			at: opening.toISOString(),
		});
	});

	test("a gap of an hour or more on the same day adds a time line and breaks the run", () => {
		const items = toThreadItems([
			msg("a", new Date(2026, 9, 8, 9, 0)),
			msg("b", new Date(2026, 9, 8, 9, 59)),
			msg("c", new Date(2026, 9, 8, 10, 59)),
			msg("d", new Date(2026, 9, 8, 11, 0)),
		]);
		expect(items.map((i) => i.kind)).toEqual([
			"day",
			"message",
			"message",
			"time",
			"message",
			"message",
		]);
		expect(items[3]).toMatchObject({
			kind: "time",
			key: "time-c",
			at: new Date(2026, 9, 8, 10, 59).toISOString(),
		});
		expect(runs(items)).toEqual([
			"a:first+last",
			"b:first+last",
			"c:first",
			"d:last",
		]);
	});

	test("a new day takes a day line, not a time line", () => {
		const items = toThreadItems([
			msg("a", new Date(2026, 9, 7, 9)),
			msg("b", new Date(2026, 9, 8, 9)),
		]);
		expect(items.map((i) => i.kind)).toEqual([
			"day",
			"message",
			"day",
			"message",
		]);
	});
});

const batch = (
	id: string,
	at: Date,
	count = 1,
	toolkit = "linear",
	finished = true,
): TriggerBatch => ({
	id,
	chatId: "me",
	triggerId: "t1",
	toolkit,
	count,
	at: at.toISOString(),
	outcome: null,
	finished,
});

describe("toThreadItems with trigger batches", () => {
	const at = (hour: number, min = 0) => new Date(2026, 9, 8, hour, min);

	test("counts the events of batches still being handled; a batch given back (no events) leaves", () => {
		const items = toThreadItems(
			[],
			[
				batch("b1", at(9), 2),
				batch("b2", at(9, 5), 3, "linear", false),
				batch("b3", at(9, 6), 0, "linear", true),
			],
		);
		expect(items.find((i) => i.kind === "events")).toMatchObject({
			count: 5,
			handling: 3,
			batchIds: ["b1", "b2"],
		});
	});

	test("folds the batches between two messages into one item, in time order", () => {
		const items = toThreadItems(
			[msg("a", at(9)), msg("b", at(9, 3))],
			[
				batch("y", at(9, 2), 3, "gmail"),
				batch("x", at(9, 1), 2),
				batch("z", at(9, 2), 1, "linear"),
			],
		);
		expect(items.map(describeItem)).toEqual([
			"day:2026-10-08",
			"a:true",
			"events:6:linear+gmail",
			"b:true",
		]);
		const events = items[2]!;
		expect(events.kind === "events" && events).toMatchObject({
			key: "events-x",
			batchIds: ["x", "y", "z"],
			from: at(9, 1).toISOString(),
			to: at(9, 2).toISOString(),
		});
	});

	test("an events item ends the author's run and starts a new one", () => {
		const items = toThreadItems(
			[msg("a", at(9)), msg("b", at(9, 2))],
			[batch("x", at(9, 1))],
		);
		expect(items.map(describeItem)).toEqual([
			"day:2026-10-08",
			"a:true",
			"events:1:linear",
			"b:true",
		]);
		expect(runs(items)).toEqual(["a:first+last", "b:first+last"]);
	});

	test("batches after the last message go at the end; empty ones and those before the first loaded message are left out", () => {
		const items = toThreadItems(
			[msg("a", at(9)), msg("b", at(10))],
			[
				batch("old", at(8)),
				batch("empty", at(9, 30), 0),
				batch("late", at(11), 4),
			],
		);
		expect(items.map(describeItem)).toEqual([
			"day:2026-10-08",
			"a:true",
			"time-b",
			"b:true",
			"events:4:linear",
		]);
	});

	test("an events item takes its first batch's day, and a later message starts its own", () => {
		const items = toThreadItems(
			[msg("a", new Date(2026, 9, 7, 22)), msg("b", new Date(2026, 9, 9, 9))],
			[batch("x", new Date(2026, 9, 8, 8))],
		);
		expect(items.map(describeItem)).toEqual([
			"day:2026-10-07",
			"a:true",
			"day:2026-10-08",
			"events:1:linear",
			"day:2026-10-09",
			"b:true",
		]);
	});

	test("a chat with no messages yet shows all its batches", () => {
		expect(
			toThreadItems([], [batch("x", at(9)), batch("y", at(10))]).map(
				describeItem,
			),
		).toEqual(["day:2026-10-08", "events:2:linear"]);
	});
});

describe("formatDay", () => {
	const now = new Date(2026, 9, 8, 12);
	test("two Devs' messages are separate bursts, and neither joins a system note", () => {
		const at = (min: number) => new Date(2026, 9, 8, 9, min);
		const items = toThreadItems([
			{ ...msg("a", at(0), null), authorDevId: "m1" },
			{ ...msg("b", at(1), null), authorDevId: "m1" },
			{ ...msg("c", at(2), null), authorDevId: "m2" },
			msg("d", at(3), null),
		]);
		expect(
			items.flatMap((i) => (i.kind === "message" ? [i.first] : [])),
		).toEqual([true, false, true, true]);
	});

	test("relative names for today and yesterday", () => {
		expect(formatDay("2026-10-08", now)).toBe("Today");
		expect(formatDay("2026-10-07", now)).toBe("Yesterday");
	});
	test("full date otherwise", () => {
		expect(formatDay("2026-10-01", now)).toBe(
			new Date(2026, 9, 1).toLocaleDateString(undefined, {
				weekday: "long",
				day: "numeric",
				month: "long",
			}),
		);
	});
});

describe("threadTimeLabel", () => {
	const now = new Date(2026, 9, 8, 12);
	const timeOf = (iso: string) => iso.slice(11, 16);
	test("a day's line is its name and the time, a time line the time alone", () => {
		const at = new Date(2026, 9, 8, 9, 41).toISOString();
		expect(
			threadTimeLabel(
				{ kind: "day", key: "d", date: "2026-10-08", at },
				now,
				timeOf,
			),
		).toBe(`Today ${timeOf(at)}`);
		expect(threadTimeLabel({ kind: "time", key: "t", at }, now, timeOf)).toBe(
			timeOf(at),
		);
	});
});

describe("toThreadItems with voice calls", () => {
	const at = (min: number) => new Date(Date.UTC(2026, 9, 23, 10, min));

	test("what was said on a call folds into its record, a line that opens to it", () => {
		const record: Message = {
			...msg("rec", at(5)),
			text: "Voice call (3:00)",
			call: { startedAt: at(2).toISOString(), durationMs: 180_000 },
		};
		const items = toThreadItems([
			msg("before", at(0)),
			msg("said", at(3)),
			msg("answer", at(4), null),
			record,
			msg("after", at(6)),
		]);
		expect(items.map(describeItem)).toEqual([
			"day:2026-10-23",
			"before:true",
			"call:180000:said+answer",
			"after:true",
		]);
	});

	test("a call going on now folds what's been said since it started into one live line at the end", () => {
		const items = toThreadItems(
			[msg("before", at(0)), msg("said", at(3)), msg("answer", at(4), null)],
			[],
			{ liveCall: { startedAt: at(2).toISOString() } },
		);
		expect(items.map(describeItem)).toEqual([
			"day:2026-10-23",
			"before:true",
			"call:live:said+answer",
		]);
		expect(
			toThreadItems([msg("before", at(0))], [], {
				liveCall: { startedAt: at(2).toISOString() },
			}).at(-1),
		).toMatchObject({ kind: "call", messages: [] });
	});
});

describe("a Dev's tasks under its message", () => {
	const start = new Date(2026, 9, 27, 15, 0);
	const minute = (n: number) => new Date(start.getTime() + n * 60_000);
	const said = (
		id: string,
		n: number,
		turnId = "turn-1",
		extra: Partial<Message> = {},
	): Message => ({
		...msg(id, minute(n), null),
		authorDevId: "max",
		turnId,
		...extra,
	});
	/** `turnId` null: a card from before messages carried their turn. */
	const task = (
		id: string,
		n: number,
		turnId: string | null = "turn-1",
		extra: Partial<Message> = {},
	): Message => ({
		...said(id, n, turnId ?? undefined),
		taskId: `t-${id}`,
		turnId: turnId ?? undefined,
		...extra,
	});
	const shape = (items: ReturnType<typeof toThreadItems>) =>
		items.flatMap((i) =>
			i.kind === "message"
				? [
						i.tasks
							? `${i.message.id}[${i.tasks.map((m) => m.id).join("+")}]`
							: i.slim
								? `slim:${i.message.id}`
								: i.message.id,
					]
				: [],
		);

	test("a turn's task cards fold under the message it wrote before them, and don't break the author's bubbles", () => {
		const items = toThreadItems([
			said("hey", 0),
			task("follow-up", 1),
			said("later", 2, "turn-2"),
		]);
		expect(shape(items)).toEqual(["hey[follow-up]", "later"]);
		expect(runs(items)).toEqual(["hey:first", "later:last"]);
	});

	test("with nothing said before them in the turn, they go under the message after them", () => {
		expect(
			shape(toThreadItems([task("a", 0), task("b", 1), said("got it", 2)])),
		).toEqual(["got it[a+b]"]);
	});

	test("they go under the turn's nearest message before them, so a turn that speaks twice keeps each task by its words", () => {
		expect(
			shape(
				toThreadItems([
					said("one", 0),
					task("a", 1),
					said("two", 2),
					task("b", 3),
				]),
			),
		).toEqual(["one[a]", "two[b]"]);
	});

	test("a turn that said nothing, a person's task and a Dev's task without a turn keep their own slim line", () => {
		const person: Message = { ...msg("mine", minute(1)), taskId: "t-mine" };
		const items = toThreadItems([
			said("hey", 0, "turn-1"),
			task("quiet", 1, "turn-2"),
			person,
			task("old", 2, null),
		]);
		expect(shape(items)).toEqual([
			"hey",
			"slim:quiet",
			"slim:mine",
			"slim:old",
		]);
	});

	test("a question the turn asked never takes them: they go under its words, else keep their slim line", () => {
		const question = {
			id: "q1",
			devId: "max",
			taskId: null,
			kind: "select",
			title: "Which?",
			body: "",
			options: [],
			allowOther: false,
			status: "open",
		} as unknown as Message["question"];
		expect(
			shape(
				toThreadItems([said("asks", 0, "turn-1", { question }), task("a", 1)]),
			),
		).toEqual(["asks", "slim:a"]);
		expect(
			shape(
				toThreadItems([
					said("hey", 0),
					said("asks", 1, "turn-1", { question }),
					task("a", 2),
				]),
			),
		).toEqual(["hey[a]", "asks"]);
	});

	test("another Dev's message in the same chat never takes them", () => {
		const other = said("wren says", 0, "turn-1", { authorDevId: "wren" });
		expect(shape(toThreadItems([other, task("a", 1)]))).toEqual([
			"wren says",
			"slim:a",
		]);
	});

	test("the message holds its tasks' messages, for a Seen receipt or a jump to one", () => {
		const [item] = toThreadItems([
			said("hey", 0),
			task("a", 1),
			task("b", 2),
		]).filter((i) => i.kind === "message");
		expect(itemHolds(item!, "hey")).toBe(true);
		expect(itemHolds(item!, "b")).toBe(true);
		expect(itemHolds(item!, "z")).toBe(false);
		expect(itemHolds(item!, null)).toBe(false);
	});

	test("a task quoting a message keeps its own card, the quote over it", () => {
		const quoted = task("q", 1, "turn-1", {
			replyTo: {
				id: "x",
				authorName: "N",
				authorKind: "person",
				authorId: "u1",
				text: "?",
			},
		});
		expect(shape(toThreadItems([said("hey", 0), quoted]))).toEqual([
			"hey",
			"q",
		]);
	});
});
