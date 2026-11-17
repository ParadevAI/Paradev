import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Task } from "../model/model.ts";
import { chatGlance } from "./chat-glance.ts";

const NOW = new Date("2026-11-09T12:00:00.000Z");
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
		{
			id: "other",
			title: "Other",
			kind: "direct",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: ["sam"],
		},
	],
	messages: [
		{
			id: "m1",
			chatId: "cos",
			authorId: null,
			authorDevId: "sam",
			text: "Started the deck",
			at: "2026-11-09T10:00:00.000Z",
		},
	],
	tasks: [
		...Array.from({ length: 5 }, (_, i) =>
			task(`mine${i}`, {
				assigneeId: "me",
				due: "2026-11-09",
				createdByDevId: "sam",
			}),
		),
		task("elsewhere", { chatId: "other", assigneeId: "me", due: "2026-11-09" }),
		task("deck", { status: "in_progress", assigneeDevId: "sam" }),
		task("mine-doing", { status: "in_progress", assigneeId: "me" }),
	],
	apps: [],
};

describe("chatGlance", () => {
	test("keeps to the chat: its needs and level, the Devs' work in progress, what's new", () => {
		const g = chatGlance(base, "cos", "2026-11-09", NOW);
		expect(g.needs).toHaveLength(5);
		expect(g.level).toBe("busy");
		expect(g.working.map((t) => t.id)).toEqual(["deck"]);
		expect(g.news?.messages.map((m) => m.id)).toEqual(["m1"]);
	});

	test("a quiet chat", () => {
		const g = chatGlance(
			{ ...base, messages: [], tasks: [] },
			"cos",
			"2026-11-09",
			NOW,
		);
		expect(g).toEqual({ needs: [], level: "calm", working: [], news: null });
	});
});
