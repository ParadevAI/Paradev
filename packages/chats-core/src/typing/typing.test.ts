import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import { typingLabel } from "./typing.ts";

const state: ChatState = {
	meId: "me",
	members: {
		me: { id: "me", name: "Me" },
		nina: { id: "nina", name: "Nina" },
		sam: { id: "sam", name: "Sam" },
		ola: { id: "ola", name: "Ola" },
	},
	devs: {},
	chats: [
		{
			id: "trip",
			title: "Trip",
			kind: "group",
			memberIds: ["me", "nina", "sam", "ola"],
			ownerIds: ["me"],
			devIds: [],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
};

describe("typingLabel", () => {
	test("names one or two people typing, and says several past that", () => {
		expect(typingLabel(state, "trip", ["nina"])).toBe("Nina is typing…");
		expect(typingLabel(state, "trip", ["nina", "sam"])).toBe(
			"Nina and Sam are typing…",
		);
		expect(typingLabel(state, "trip", ["nina", "sam", "ola"])).toBe(
			"Several people are typing…",
		);
	});

	test("never the viewer's own typing, nor someone who isn't in the chat", () => {
		expect(typingLabel(state, "trip", [])).toBeNull();
		expect(typingLabel(state, "trip", ["me"])).toBeNull();
		expect(typingLabel(state, "trip", ["me", "stranger", "sam"])).toBe(
			"Sam is typing…",
		);
		expect(typingLabel(state, "elsewhere", ["nina"])).toBeNull();
	});
});
