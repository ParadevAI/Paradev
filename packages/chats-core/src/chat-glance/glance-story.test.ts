import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Task } from "../model/model.ts";
import type { NeedItem } from "../needs-you/needs-you.ts";
import type { ChatGlance } from "./chat-glance.ts";
import { glanceStory } from "./glance-story.ts";

const task = (id: string, over: Partial<Task> = {}): Task => ({
	id,
	chatId: "cos",
	title: id,
	description: "",
	status: "todo",
	assigneeId: "me",
	assigneeDevId: null,
	due: "2026-11-09",
	scheduledAt: null,
	remind: false,
	repeat: null,
	createdAt: "2026-11-08T09:00:00.000Z",
	...over,
});
const need = (
	kind: NeedItem["kind"],
	title: string,
	over: Partial<NeedItem> = {},
): NeedItem => ({
	kind,
	chatId: "cos",
	devId: "sam",
	at: "",
	title,
	...over,
});
const linear = Array.from({ length: 22 }, (_, i) =>
	task(`s${i}`, { labels: ["linear"] }),
);
const state: ChatState = {
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
	chats: [],
	messages: [],
	tasks: [
		...linear,
		task("gmail", {
			status: "done",
			assigneeId: null,
			assigneeDevId: "sam",
		}),
		task("deck", {
			status: "in_progress",
			assigneeId: null,
			assigneeDevId: "sam",
		}),
	],
	apps: [],
};
const glance = (over: Partial<ChatGlance>): ChatGlance => ({
	needs: [],
	level: "calm",
	working: [],
	news: null,
	...over,
});

describe("glanceStory", () => {
	test("Sam's pile reads as what it is", () => {
		const needs = linear.map((t) => need("task", t.title, { taskId: t.id }));
		const s = glanceStory(state, glance({ needs, level: "full" }));
		expect(s.levelWord).toBe("Full");
		expect(s.levelLine).toBe("Too much for one day: 22 things waiting on you.");
		expect(s.lines).toEqual([
			"Sam has given you 22 Linear issues, all due today.",
			"Nothing new since you were last here.",
		]);
	});

	test("questions first, late tasks said, work in progress, news", () => {
		const needs = [
			need("question", "Merge PR #9418?"),
			need("task", "a", { taskId: "s0", late: true }),
			need("task", "b", { taskId: "s1" }),
		];
		const s = glanceStory(
			state,
			glance({
				needs,
				working: [state.tasks.find((t) => t.id === "deck")!],
				news: {
					chatId: "cos",
					since: null,
					messages: [
						{ id: "m", chatId: "cos", authorId: null, text: "", at: "" },
						{ id: "n", chatId: "cos", authorId: null, text: "", at: "" },
					],
					finished: [],
					questions: [],
					latest: null,
					at: "",
				},
			}),
		);
		expect(s.lines).toEqual([
			"Sam is waiting on your answer to “Merge PR #9418?”.",
			"Sam has given you 2 Linear issues, 1 of them late.",
			"Sam is working on “deck”.",
			"2 new messages since you were last here.",
		]);
		expect(s.levelLine).toBe("3 small things waiting on you.");
	});

	test("a quiet chat", () => {
		expect(glanceStory(state, glance({}))).toEqual({
			levelWord: "Calm",
			levelLine: "Nothing is waiting on you here.",
			lines: ["Nothing new since you were last here."],
		});
	});
});
