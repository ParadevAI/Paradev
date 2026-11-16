import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Message, Task } from "../model/model.ts";
import { catchUpLine, sinceYouLeft } from "./since-you-left.ts";

const at = (h: number) => `2026-11-09T${String(h).padStart(2, "0")}:00:00.000Z`;
const msg = (
	id: string,
	chatId: string,
	h: number,
	over: Partial<Message> = {},
): Message => ({
	id,
	chatId,
	authorId: null,
	authorDevId: "sam",
	text: id,
	at: at(h),
	...over,
});
const done = (id: string, chatId: string, h: number): Task => ({
	id,
	chatId,
	title: id,
	description: "",
	status: "done",
	assigneeId: null,
	assigneeDevId: "sam",
	due: null,
	scheduledAt: null,
	remind: false,
	repeat: null,
	createdAt: at(1),
	completedAt: at(h),
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
			title: "CoS",
			kind: "direct",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: ["sam"],
		},
		{
			id: "quiet",
			title: "Quiet",
			kind: "direct",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: ["sam"],
		},
		{
			id: "tasks",
			title: "Tasks",
			kind: "direct",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: ["sam"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
	reads: [
		{
			chatId: "cos",
			reader: { kind: "person", id: "me" },
			messageId: "a",
			messageAt: at(5),
			at: at(5),
		},
		{
			chatId: "quiet",
			reader: { kind: "person", id: "me" },
			messageId: "q",
			messageAt: at(9),
			at: at(9),
		},
		{
			chatId: "tasks",
			reader: { kind: "person", id: "me" },
			messageId: "t",
			messageAt: at(5),
			at: at(5),
		},
	],
};

describe("sinceYouLeft", () => {
	const state: ChatState = {
		...base,
		messages: [
			msg("a", "cos", 5),
			msg("b", "cos", 6),
			msg("mine", "cos", 7, { authorId: "me", authorDevId: undefined }),
			msg("c", "cos", 8, {
				question: {
					id: "q",
					devId: "sam",
					taskId: null,
					kind: "select",
					title: "Which?",
					body: "",
					options: [],
					forUserId: "me",
					status: "open",
					expiresAt: at(12),
				} as unknown as Message["question"],
			}),
			msg("q", "quiet", 9),
		],
		tasks: [done("t1", "tasks", 10), done("t0", "tasks", 4)],
	};

	test("lists chats with news after my read, newest first, without my own messages", () => {
		const list = sinceYouLeft(state);
		expect(list.map((c) => c.chatId)).toEqual(["tasks", "cos"]);
		const cos = list.find((c) => c.chatId === "cos")!;
		expect(cos.messages.map((m) => m.id)).toEqual(["b", "c"]);
		expect(cos.questions.map((m) => m.id)).toEqual(["c"]);
		expect(cos.latest?.id).toBe("c");
		expect(
			list.find((c) => c.chatId === "tasks")!.finished.map((t) => t.id),
		).toEqual(["t1"]);
	});

	test("a chat never read counts everything", () => {
		const fresh = sinceYouLeft({ ...state, reads: [] });
		expect(fresh.find((c) => c.chatId === "quiet")?.messages).toHaveLength(1);
		expect(fresh.find((c) => c.chatId === "quiet")?.since).toBeNull();
	});

	test("in a line", () => {
		const [tasks, cos] = sinceYouLeft(state);
		expect(catchUpLine(cos!)).toBe("2 new · a question for you");
		expect(catchUpLine(tasks!)).toBe("a task done");
	});
});
