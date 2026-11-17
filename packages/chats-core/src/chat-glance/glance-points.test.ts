import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Message, Task } from "../model/model.ts";
import { chatGlance } from "./chat-glance.ts";
import { glancePoints } from "./glance-points.ts";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const DAY_START = "2026-11-09T00:00:00.000Z";
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
	createdAt: "2026-11-08T09:00:00.000Z",
	...over,
});
const _question = (id: string, title: string): Message =>
	({
		id,
		chatId: "cos",
		authorId: null,
		authorDevId: "sam",
		text: title,
		at: "2026-11-09T09:00:00.000Z",
		question: {
			id: `q-${id}`,
			devId: "sam",
			title,
			options: [],
			status: "open",
			forUserId: "me",
		},
	}) as unknown as Message;

const base: ChatState = {
	meId: "me",
	members: { me: { id: "me", name: "Me" } },
	devs: {
		sam: {
			id: "sam",
			kind: "custom",
			name: "Sam",
			color: "#9DB89A",
			ownerId: "me",
			description: "",
		},
	},
	chats: [
		{
			id: "cos",
			title: "Sam",
			kind: "direct",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: ["sam"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
};
const points = (state: ChatState) =>
	glancePoints(
		state,
		"cos",
		chatGlance(state, "cos", "2026-11-09", NOW),
		DAY_START,
	);

describe("glancePoints", () => {
	test("what needs you: the tasks due as one point, then the brief's points that need someone", () => {
		const state: ChatState = {
			...base,
			tasks: [
				task("a", { assigneeId: "me", due: "2026-11-09" }),
				task("b", { assigneeId: "me", due: "2026-11-08" }),
			],
			briefs: [
				{
					chatId: "cos",
					devId: "sam",
					updatedAt: "2026-11-08T20:00:00.000Z",
					topics: [
						{ topic: "HDFC", line: "reply unsent", needsYou: true },
						{
							topic: "Waiting on you",
							line: "the PR #9165 design call",
							needsYou: true,
						},
						{
							topic: "Handoffs",
							line: "Coda checks #9313 tonight",
							needsYou: false,
						},
					],
				},
			],
		};
		const p = points(state);
		expect(p.needsYou.map((x) => [x.text, x.from])).toEqual([
			["2 tasks, 1 late", "app"],
			["HDFC: reply unsent", "brief"],
			["The PR #9165 design call", "brief"],
		]);
		expect(p.onIt.map((x) => x.text)).toEqual([
			"Handoffs: Coda checks #9313 tonight",
		]);
		expect(p.briefAt).toBe("2026-11-08T20:00:00.000Z");
	});

	test("a lone task is named; a Dev's work in progress is what it's on; today's finished tasks are done", () => {
		const state: ChatState = {
			...base,
			tasks: [
				task("Pay rent", { assigneeId: "me", due: "2026-11-09" }),
				task("Deck", { status: "in_progress", assigneeDevId: "sam" }),
				task("Diary", {
					status: "done",
					completedAt: "2026-11-09T08:00:00.000Z",
				}),
				task("Old", {
					status: "done",
					completedAt: "2026-11-08T08:00:00.000Z",
				}),
			],
		};
		const p = points(state);
		expect(p.needsYou.map((x) => x.text)).toEqual(["Pay rent, due today"]);
		expect(p.onIt.map((x) => x.text)).toEqual(["Deck"]);
		expect(p.done.map((x) => x.text)).toEqual(["Diary"]);
		expect(p.briefAt).toBeNull();
	});
});

describe("briefStale", () => {
	const brief = {
		chatId: "cos",
		devId: "sam",
		updatedAt: "2026-11-09T10:00:00.000Z",
		topics: [{ topic: "Deck", line: "drafting", needsYou: false }],
	};
	const msg = (
		id: string,
		at: string,
		by: { authorId?: string; authorDevId?: string },
	): Message => ({
		id,
		chatId: "cos",
		authorId: by.authorId ?? null,
		...(by.authorDevId ? { authorDevId: by.authorDevId } : {}),
		text: "x",
		at,
	});

	test("the Dev's own reply after its brief, or an answer right after, doesn't make it stale", () => {
		const state: ChatState = {
			...base,
			briefs: [brief],
			messages: [
				msg("r", "2026-11-09T10:00:05.000Z", { authorDevId: "sam" }),
				msg("t", "2026-11-09T10:10:00.000Z", { authorId: "me" }),
			],
		};
		expect(points(state).briefStale).toBe(false);
	});

	test("someone writing a while after the brief does", () => {
		const state: ChatState = {
			...base,
			briefs: [brief],
			messages: [msg("t", "2026-11-09T11:00:00.000Z", { authorId: "me" })],
		};
		expect(points(state).briefStale).toBe(true);
	});
});
