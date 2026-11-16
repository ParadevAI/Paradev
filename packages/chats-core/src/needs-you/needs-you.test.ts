import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Message, Question, Task } from "../model/model.ts";
import { loadLevel, needsYou, needsYouLine, pileWords } from "./needs-you.ts";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const TODAY = "2026-11-09";

const task = (id: string, over: Partial<Task>): Task => ({
	id,
	chatId: "cos",
	title: id,
	description: "",
	status: "todo",
	assigneeId: null,
	assigneeDevId: null,
	due: null,
	scheduledAt: null,
	remind: false,
	repeat: null,
	createdAt: "2026-11-01T09:00:00.000Z",
	...over,
});
const question = (id: string, over: Partial<Question> = {}): Question =>
	({
		id,
		devId: "coda",
		taskId: null,
		kind: "select",
		title: `Question ${id}?`,
		body: "",
		options: [],
		forUserId: "me",
		status: "open",
		expiresAt: "2026-11-09T13:00:00.000Z",
		...over,
	}) as Question;
const asking = (id: string, chatId: string, q: Question): Message => ({
	id,
	chatId,
	authorId: null,
	authorDevId: q.devId ?? undefined,
	text: "",
	at: "2026-11-08T10:00:00.000Z",
	question: q,
});

const base: ChatState = {
	meId: "me",
	members: { me: { id: "me", name: "Me" }, nina: { id: "nina", name: "Nina" } },
	devs: {
		sam: {
			id: "sam",
			kind: "custom",
			name: "Sam",
			color: "#9DB89A",
			ownerId: "me",
			description: "",
		},
		coda: {
			id: "coda",
			kind: "custom",
			name: "Coda",
			color: "#9DB89A",
			ownerId: "me",
			description: "",
		},
		wren: {
			id: "wren",
			kind: "group",
			name: "Wren",
			color: "#F2B23E",
			ownerId: null,
			description: "",
		},
	},
	chats: [
		{
			id: "cos",
			title: "CoS",
			kind: "direct",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: ["sam"],
		},
		{
			id: "coda-dm",
			title: "Coda",
			kind: "direct",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: ["coda"],
		},
		{
			id: "trip",
			title: "Trip",
			kind: "group",
			memberIds: ["me", "nina"],
			ownerIds: ["nina"],
			devIds: ["wren"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
};

describe("needsYou", () => {
	test("counts my tasks due today or late, by the Dev that handed them over", () => {
		const state: ChatState = {
			...base,
			tasks: [
				task("today", {
					assigneeId: "me",
					due: TODAY,
					createdByDevId: "sam",
				}),
				task("late", {
					assigneeId: "me",
					due: "2026-11-02",
					createdByDevId: "sam",
				}),
				task("later", {
					assigneeId: "me",
					due: "2026-11-20",
					createdByDevId: "sam",
				}),
				task("undated", { assigneeId: "me", createdByDevId: "sam" }),
				task("done", { assigneeId: "me", due: TODAY, status: "done" }),
				task("ninas", { assigneeId: "nina", due: TODAY, chatId: "trip" }),
			],
		};
		const n = needsYou(state, TODAY, NOW);
		expect(n.items.map((i) => i.taskId)).toEqual(["today", "late"]);
		expect(n.items.find((i) => i.taskId === "late")?.late).toBe(true);
		expect(n.piles).toHaveLength(1);
		expect(n.piles[0]).toMatchObject({
			key: "sam",
			devId: "sam",
			chatId: "cos",
			level: "calm",
		});
	});

	test("a task with no Dev behind it is its chat's; in a 1:1 it's the chat's Dev's", () => {
		const state: ChatState = {
			...base,
			tasks: [
				task("g", { assigneeId: "me", due: TODAY, chatId: "trip" }),
				task("d", { assigneeId: "me", due: TODAY, chatId: "coda-dm" }),
			],
		};
		const keys = needsYou(state, TODAY, NOW)
			.piles.map((p) => p.key)
			.sort();
		expect(keys).toEqual(["chat:trip", "coda"]);
	});

	test("questions I may answer count; others' don't", () => {
		const state: ChatState = {
			...base,
			messages: [
				asking("m1", "coda-dm", question("q1")),
				asking(
					"m2",
					"trip",
					question("q2", { devId: "wren", forUserId: "nina" }),
				),
			],
		};
		const n = needsYou(state, TODAY, NOW);
		expect(n.items).toEqual([
			expect.objectContaining({
				kind: "question",
				chatId: "coda-dm",
				devId: "coda",
				messageId: "m1",
			}),
		]);
	});

	test("nothing assigned to a Dev waits on me, done or not: a daily one just runs again", () => {
		const done = (id: string, completedAt: string, over: Partial<Task> = {}) =>
			task(id, {
				status: "done",
				assigneeDevId: "sam",
				completedAt,
				...over,
			});
		const state: ChatState = {
			...base,
			tasks: [
				done("fresh", "2026-11-09T09:00:00.000Z"),
				done("seen", "2026-11-08T09:00:00.000Z"),
				done("old", "2026-10-20T09:00:00.000Z"),
				done("for-nina", "2026-11-09T09:00:00.000Z", {
					chatId: "trip",
					assigneeDevId: "wren",
					createdBy: "nina",
				}),
				done("for-me", "2026-11-09T09:00:00.000Z", {
					chatId: "trip",
					assigneeDevId: "wren",
					createdBy: "me",
				}),
			],
			reads: [
				{
					chatId: "cos",
					reader: { kind: "person", id: "me" },
					messageId: "x",
					messageAt: "2026-11-08T12:00:00.000Z",
					at: "2026-11-08T12:00:00.000Z",
				},
			],
		};
		expect(
			needsYou(
				{
					...state,
					tasks: [
						...state.tasks,
						task("running", { assigneeDevId: "sam", due: TODAY }),
					],
				},
				TODAY,
				NOW,
			).items,
		).toEqual([]);
	});

	test("piles come biggest first, each with its level", () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			task(`s${i}`, { assigneeId: "me", due: TODAY, createdByDevId: "sam" }),
		);
		const state: ChatState = {
			...base,
			tasks: [
				...many,
				task("c", {
					assigneeId: "me",
					due: TODAY,
					createdByDevId: "coda",
					chatId: "coda-dm",
				}),
			],
		};
		const piles = needsYou(state, TODAY, NOW).piles;
		expect(piles.map((p) => [p.key, p.items.length, p.level])).toEqual([
			["sam", 9, "full"],
			["coda", 1, "calm"],
		]);
	});
});

describe("words", () => {
	test("levels", () => {
		expect([0, 3, 4, 7, 8, 22].map(loadLevel)).toEqual([
			"calm",
			"calm",
			"busy",
			"busy",
			"full",
			"full",
		]);
	});
	test("the line", () => {
		expect([0, 1, 26].map(needsYouLine)).toEqual([
			"Nothing needs you",
			"1 thing needs you",
			"26 things need you",
		]);
	});
	test("a pile in words", () => {
		const t = (late = false) => ({
			kind: "task" as const,
			chatId: "c",
			devId: null,
			at: "",
			title: "",
			late,
		});
		expect(pileWords(Array.from({ length: 22 }, () => t()))).toBe(
			"22 tasks due today",
		);
		expect(pileWords([t(true)])).toBe("a task, late");
		expect(pileWords([t(true), t(true)])).toBe("2 tasks, all late");
		expect(pileWords([t(), t(true), t()])).toBe("3 tasks, 1 late");
		expect(
			pileWords([
				{ kind: "question", chatId: "c", devId: null, at: "", title: "" },
				t(),
			]),
		).toBe("a question for you · a task due today");
	});
});
