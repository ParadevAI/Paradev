import { expect, test } from "bun:test";
import type { ChatState } from "@superset/chats-core";
import type { RealtimeEvent } from "@superset/chats-sync";
import { chatNotification, chatOfReplyTarget } from "./chatNotification";

const state = {
	meId: "me",
	members: { me: { id: "me", name: "Me" }, ana: { id: "ana", name: "Ana" } },
	devs: { d1: { id: "d1", name: "Scout" } },
	chats: [
		{
			id: "g1",
			title: "Launch",
			kind: "group",
			memberIds: ["me", "ana"],
			ownerIds: ["me"],
			devIds: ["d1"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
} as unknown as ChatState;

const message = (fields: Record<string, unknown>) => ({
	id: "m1",
	groupId: "g1",
	authorId: null,
	authorDevId: null,
	text: "ship **it**",
	taskId: null,
	...fields,
});

const created = (fields: Record<string, unknown>, task: unknown = null) =>
	({
		type: "message.created",
		message: message(fields),
		task,
	}) as unknown as RealtimeEvent;

const away = { openChatId: null, focused: true };

test("a teammate's message notifies with the group as its subtitle and a reply box", () => {
	expect(chatNotification(state, created({ authorId: "ana" }), away)).toEqual({
		title: "Ana",
		subtitle: "Launch",
		body: "ship it",
		clickPath: "/chats/g1",
		id: "m1",
		groupId: "chat:g1",
		replyTarget: "chat:g1",
	});
	expect(chatOfReplyTarget("chat:g1")).toBe("g1");
	expect(chatOfReplyTarget("channel:c1")).toBeNull();
});

test("your own message and a note do not notify", () => {
	expect(chatNotification(state, created({ authorId: "me" }), away)).toBeNull();
	expect(chatNotification(state, created({}), away)).toBeNull();
});

test("the chat on screen stays quiet only while the window has focus", () => {
	const event = created({ authorId: "ana" });
	expect(
		chatNotification(state, event, { openChatId: "g1", focused: true }),
	).toBeNull();
	expect(
		chatNotification(state, event, { openChatId: "g1", focused: false }),
	).not.toBeNull();
});

test("a Dev's question and a task card notify as one line", () => {
	const asked = {
		type: "question.asked",
		message: message({
			authorDevId: "d1",
			text: "Which day?",
			question: { title: "Which day?" },
		}),
	} as unknown as RealtimeEvent;
	expect(chatNotification(state, asked, away)).toMatchObject({
		title: "Scout",
		body: "Asks: Which day?",
	});
	expect(
		chatNotification(
			state,
			created({ authorId: "ana", taskId: "t1" }, { title: "Pay rent" }),
			away,
		),
	).toMatchObject({ body: "Task: Pay rent" });
});
