import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Message, Question, Task } from "../model/model.ts";
import { activityBetween, trimActivity } from "./load-activity.ts";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const at = (h: number) => `2026-11-09T${String(h).padStart(2, "0")}:00:00.000Z`;
const msg = (
	id: string,
	h: number,
	text: string,
	over: Partial<Message> = {},
): Message => ({
	id,
	chatId: "c",
	authorId: null,
	authorDevId: "sam",
	text,
	at: at(h),
	...over,
});
const task = (over: Partial<Task> = {}): Task => ({
	id: "t",
	chatId: "c",
	title: "t",
	description: "",
	status: "todo",
	assigneeId: "me",
	assigneeDevId: null,
	due: "2026-11-09",
	scheduledAt: null,
	remind: false,
	repeat: null,
	createdAt: at(1),
	...over,
});
const read = (h: number) => ({
	chatId: "c",
	reader: { kind: "person" as const, id: "me" },
	messageId: "x",
	messageAt: at(h),
	at: at(h),
});
const base: ChatState = {
	meId: "me",
	members: {},
	devs: {},
	chats: [],
	messages: [],
	tasks: [],
	apps: [],
};

describe("activityBetween", () => {
	test("a read that moves forward counts the others' words read and the events among them", () => {
		const messages = [
			msg("a", 5, "one two three"),
			msg("b", 6, "four five"),
			msg("mine", 6, "not counted at all", {
				authorId: "me",
				authorDevId: undefined,
			}),
			msg("c", 9, "later"),
		];
		const prev = { ...base, messages, reads: [read(4)] };
		const next = {
			...prev,
			reads: [read(7)],
			triggerBatches: [
				{
					id: "b",
					chatId: "c",
					triggerId: "t",
					toolkit: "gmail",
					count: 3,
					at: at(6),
					outcome: "",
					finished: true,
				},
			],
		};
		expect(activityBetween(prev, next, NOW)).toEqual([
			{ at: NOW.toISOString(), kind: "read", chatId: "c", words: 5, events: 3 },
		]);
		expect(activityBetween(next, next, NOW)).toEqual([]);
	});

	test("a question I answered, not one someone else did", () => {
		const q = (status: Question["status"], answeredBy: string | null) =>
			({ id: "q", status, answeredBy }) as Question;
		const prev = {
			...base,
			messages: [msg("m", 5, "", { question: q("open", null) })],
		};
		expect(
			activityBetween(
				prev,
				{
					...base,
					messages: [msg("m", 5, "", { question: q("answered", "me") })],
				},
				NOW,
			).map((a) => a.kind),
		).toEqual(["answer"]);
		expect(
			activityBetween(
				prev,
				{
					...base,
					messages: [msg("m", 5, "", { question: q("answered", "nina") })],
				},
				NOW,
			),
		).toEqual([]);
	});

	test("my task done, given away or moved; others' tasks don't count", () => {
		const prev = {
			...base,
			tasks: [task(), task({ id: "nina", assigneeId: "nina" })],
		};
		const kinds = (next: Task[]) =>
			activityBetween(prev, { ...base, tasks: next }, NOW).map((a) => a.kind);
		expect(kinds([task({ status: "done" })])).toEqual(["task"]);
		expect(kinds([task({ assigneeId: null, assigneeDevId: "sam" })])).toEqual([
			"task",
		]);
		expect(kinds([task({ due: "2026-11-10" })])).toEqual(["task"]);
		expect(
			kinds([task(), task({ id: "nina", assigneeId: "nina", status: "done" })]),
		).toEqual([]);
	});
});

test("trimActivity keeps the last six hours", () => {
	const log = [
		{ at: at(5), kind: "view" as const, chatId: "c" },
		{ at: at(7), kind: "view" as const, chatId: "c" },
	];
	expect(trimActivity(log, NOW)).toEqual([log[1]!]);
});
