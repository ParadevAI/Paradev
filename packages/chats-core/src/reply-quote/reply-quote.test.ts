import { describe, expect, test } from "bun:test";
import {
	type ChatState,
	reduce,
	withoutMessage,
} from "../chat-state/chat-state.ts";
import type { Message } from "../model/model.ts";
import { quotedAuthor, quoteText, replyQuoteOf } from "./reply-quote.ts";

const original: Message = {
	id: "m-1",
	chatId: "trip",
	authorId: "bo",
	text: "**Flights** are up, <@user:00000000-0000-4000-8000-000000000001>\nand more",
	at: "2026-10-13T10:00:00Z",
};

const state: ChatState = {
	meId: "00000000-0000-4000-8000-000000000001",
	members: {
		"00000000-0000-4000-8000-000000000001": {
			id: "00000000-0000-4000-8000-000000000001",
			name: "Me",
		},
		bo: { id: "bo", name: "Bo" },
	},
	devs: {
		m1: {
			id: "m1",
			kind: "group",
			name: "Wren",
			color: "#F2B23E",
			ownerId: null,
			description: "",
		},
	},
	chats: [
		{
			id: "trip",
			title: "Trip",
			kind: "group",
			memberIds: ["00000000-0000-4000-8000-000000000001", "bo"],
			ownerIds: ["bo"],
			devIds: ["m1"],
		},
	],
	messages: [
		original,
		{
			id: "m-2",
			chatId: "trip",
			authorId: null,
			authorDevId: "m1",
			text: "",
			taskId: "t1",
			at: "2026-10-13T10:01:00Z",
		},
	],
	tasks: [
		{
			id: "t1",
			chatId: "trip",
			title: "Pay rent",
			description: "",
			status: "todo",
			assigneeId: null,
			assigneeDevId: null,
			due: null,
			scheduledAt: null,
			remind: false,
			repeat: null,
			createdAt: "",
		},
	],
	apps: [],
};

describe("quoteText", () => {
	test("the first line of words, without markdown, cut to 140 characters", () => {
		expect(quoteText({ text: "## Plan\n- day one" })).toBe("Plan");
		expect(quoteText({ text: "```\ncode\n```" })).toBe("code");
		expect(quoteText({ text: "x".repeat(200) })).toHaveLength(140);
		expect(quoteText({ text: "x".repeat(200) }).endsWith("…")).toBe(true);
	});

	test("a card is its line", () => {
		expect(quoteText({ text: "", taskTitle: "Pay rent" })).toBe(
			"Task: Pay rent",
		);
		expect(quoteText({ text: "", fileName: "menu.pdf" })).toBe(
			"File: menu.pdf",
		);
		expect(quoteText({ text: "Sketched it", appName: "Budget" })).toBe(
			"Sketch: Budget",
		);
	});
});

describe("replyQuoteOf", () => {
	test("a person's message, with mentions as names", () => {
		expect(replyQuoteOf(state, original)).toEqual({
			id: "m-1",
			authorName: "Bo",
			authorKind: "person",
			authorId: "bo",
			text: "Flights are up, @Me",
		});
	});

	test("a Dev's task card", () => {
		expect(replyQuoteOf(state, state.messages[1]!)).toMatchObject({
			authorName: "Wren",
			authorKind: "dev",
			authorId: "m1",
			text: "Task: Pay rent",
		});
	});

	test("the reader's own message is quoted as You", () => {
		expect(
			quotedAuthor(state, {
				id: "x",
				authorName: "Me",
				authorKind: "person",
				authorId: state.meId,
				text: "hi",
			}),
		).toBe("You");
		expect(quotedAuthor(state, replyQuoteOf(state, original))).toBe("Bo");
	});
});

describe("sending a reply", () => {
	const env = {
		now: () => new Date("2026-10-13T11:00:00Z"),
		id: () => "local-1",
	};

	test("shows the quote at once; a message of another chat isn't quoted", () => {
		const sent = reduce(
			state,
			{ type: "send", chatId: "trip", text: "booking", replyToId: "m-1" },
			env,
		);
		expect(sent.messages.at(-1)!.replyTo).toEqual(
			replyQuoteOf(state, original),
		);
		const elsewhere = reduce(
			{
				...state,
				chats: [...state.chats, { ...state.chats[0]!, id: "other" }],
			},
			{ type: "send", chatId: "other", text: "x", replyToId: "m-1" },
			env,
		);
		expect(elsewhere.messages.at(-1)).not.toHaveProperty("replyTo");
	});

	test("deleting the original drops the quotes of it, as the server forgets them", () => {
		const sent = reduce(
			state,
			{ type: "send", chatId: "trip", text: "booking", replyToId: "m-1" },
			env,
		);
		const after = withoutMessage(sent, "m-1");
		expect(after.messages.map((m) => m.id)).toEqual(["m-2", "local-1"]);
		expect(after.messages.at(-1)).not.toHaveProperty("replyTo");
		expect(withoutMessage(after, "gone")).toBe(after);
	});
});
