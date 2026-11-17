import { expect, test } from "bun:test";
import type { ChatState } from "@superset/chats-core";
import { chatNotification } from "./chatNotification";

const state = {
	meId: "me",
	members: { me: { id: "me", name: "Me" }, ana: { id: "ana", name: "Ana" } },
	devs: {},
	chats: [
		{
			id: "g1",
			title: "Launch",
			kind: "group",
			memberIds: ["me", "ana"],
			ownerIds: ["me"],
			devIds: [],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
} as unknown as ChatState;

const from = (authorId: string | null) => ({
	id: "m1",
	groupId: "g1",
	authorId,
	authorDevId: null,
	text: "ship it",
});

test("a teammate's message notifies with the group as its subtitle", () => {
	expect(chatNotification(state, from("ana"))).toMatchObject({
		title: "Ana",
		subtitle: "Launch",
		body: "ship it",
		clickPath: "/chats/g1",
	});
});

test("your own message and a note do not notify", () => {
	expect(chatNotification(state, from("me"))).toBeNull();
	expect(chatNotification(state, from(null))).toBeNull();
});
