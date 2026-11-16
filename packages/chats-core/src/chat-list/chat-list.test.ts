import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { ChatRead, Message, Question } from "../model/model.ts";
import { chatRows, messagePreview, unreadChatCount } from "./chat-list.ts";

/** Mention tokens carry uuids. */
const SAM = "00000000-0000-4000-8000-0000000000aa";
const msg = (
	id: string,
	chatId: string,
	at: string,
	author: Partial<Message> = {},
): Message => ({ id, chatId, authorId: "me", text: id, at, ...author });
const myRead = (chatId: string, messageAt: string): ChatRead => ({
	chatId,
	reader: { kind: "person", id: "me" },
	messageId: `read-${chatId}`,
	messageAt,
	at: messageAt,
});

/** Me in my 1:1 with Juniper, a 1:1 with my custom Dev Ledger, and "Trip" with Priya and its Dev Wren. */
function fixture(
	reads: Record<string, string> = {
		dm: "2026-10-10T10:00:00.000Z",
		trip: "2026-10-10T09:00:00.000Z",
	},
): ChatState {
	return {
		meId: "me",
		members: {
			me: { id: "me", name: "Me" },
			priya: { id: "priya", name: "Priya" },
			[SAM]: { id: SAM, name: "Sam" },
		},
		devs: {
			jun: {
				id: "jun",
				kind: "personal",
				name: "Juniper",
				color: "#F2B23E",
				ownerId: "me",
				description: "",
			},
			ledger: {
				id: "ledger",
				kind: "custom",
				name: "Ledger",
				color: "#F2B23E",
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
				id: "dm",
				title: "Juniper",
				kind: "direct",
				memberIds: ["me"],
				ownerIds: ["me"],
				devIds: ["jun"],
			},
			{
				id: "ledger-dm",
				title: "Ledger",
				kind: "direct",
				memberIds: ["me"],
				ownerIds: ["me"],
				devIds: ["ledger"],
			},
			{
				id: "trip",
				title: "Trip",
				kind: "group",
				memberIds: ["me", "priya"],
				ownerIds: ["me"],
				devIds: ["wren"],
			},
		],
		messages: [
			msg("m1", "dm", "2026-10-10T09:00:00.000Z", {
				taskId: "t1",
				text: "/task Pay rent",
			}),
			msg("m2", "dm", "2026-10-10T09:05:00.000Z", {
				authorId: null,
				authorDevId: "jun",
				text: "**On** it",
			}),
			msg("l1", "ledger-dm", "2026-10-09T09:00:00.000Z"),
			msg("t-1", "trip", "2026-10-10T10:00:00.000Z", {
				authorId: "priya",
				text: "Flights?",
			}),
			msg("t-2", "trip", "2026-10-10T10:01:00.000Z", {
				authorId: null,
				authorDevId: "wren",
				text: `ask <@user:${SAM}> later`,
			}),
		],
		tasks: [
			{
				id: "t1",
				chatId: "dm",
				title: "Pay rent",
				description: "",
				status: "todo",
				assigneeId: null,
				assigneeDevId: null,
				due: null,
				scheduledAt: null,
				remind: false,
				repeat: null,
				createdAt: "2026-10-10T09:00:00.000Z",
			},
		],
		apps: [],
		reads: Object.entries(reads).map(([chatId, at]) => myRead(chatId, at)),
	};
}

const chat = (state: ChatState, id: string) =>
	state.chats.find((c) => c.id === id)!;

describe("messagePreview", () => {
	test("tasks, my messages, markdown as plain words, and authors named only in groups", () => {
		const state = fixture();
		const byId = (id: string) => state.messages.find((m) => m.id === id)!;
		expect(messagePreview(state, chat(state, "dm"), byId("m1"))).toBe(
			"You: Task: Pay rent",
		);
		expect(messagePreview(state, chat(state, "dm"), byId("m2"))).toBe("On it");
		expect(messagePreview(state, chat(state, "trip"), byId("t-1"))).toBe(
			"Priya: Flights?",
		);
		expect(messagePreview(state, chat(state, "trip"), byId("t-2"))).toBe(
			"Wren: ask @Sam later",
		);
	});

	test("a list, code and an app's address read as words", () => {
		const state = fixture();
		const dev = msg("x", "dm", "2026-10-10T11:00:00.000Z", {
			authorId: null,
			authorDevId: "jun",
			text: "Added **Pay rent**, due _today_\n- `dev task list`",
		});
		expect(messagePreview(state, chat(state, "dm"), dev)).toBe(
			"Added Pay rent, due today dev task list",
		);
		const link = {
			...dev,
			text: "It's up: https://11111111-0000-4000-8000-000000000009.devusercontent.com/_v/2/",
		};
		expect(messagePreview(state, chat(state, "dm"), link)).toBe(
			"It's up: Sketch",
		);
	});

	test("a card without words says what it is", () => {
		const state = fixture();
		const file = msg("f", "trip", "2026-10-10T11:00:00.000Z", {
			authorId: "priya",
			text: "",
			file: {
				id: "f1",
				chatId: "trip",
				name: "menu.pdf",
				title: "",
				mime: "application/pdf",
				size: 10,
				sharedBy: null,
			} as Message["file"],
		});
		expect(messagePreview(state, chat(state, "trip"), file)).toBe(
			"Priya: File: menu.pdf",
		);
		const voice = msg("v", "trip", "2026-10-10T11:00:00.000Z", {
			authorId: "priya",
			text: "",
			voice: { durationMs: 6_000, waveform: [], status: "transcribing" },
		});
		expect(messagePreview(state, chat(state, "trip"), voice)).toBe(
			"Priya: 🎤 Voice note (0:06)",
		);
		expect(
			messagePreview(state, chat(state, "trip"), {
				...voice,
				text: "See you at 4",
			}),
		).toBe("Priya: 🎤 See you at 4");
	});
});

describe("chatRows", () => {
	test("my Dev's 1:1 is pinned on top, then every chat by latest activity", () => {
		expect(chatRows(fixture()).map((r) => [r.title, r.pinned])).toEqual([
			["Juniper", true],
			["Trip", false],
			["Ledger", false],
		]);
	});

	test("unread counts others' messages after my read, never my own", () => {
		expect(chatRows(fixture()).map((r) => [r.title, r.unread])).toEqual([
			["Juniper", 0],
			["Trip", 2],
			["Ledger", 0],
		]);
	});

	test("filters by chip and search text", () => {
		const state = fixture();
		expect(chatRows(state, "unread").map((r) => r.title)).toEqual(["Trip"]);
		expect(chatRows(state, "groups").map((r) => r.title)).toEqual(["Trip"]);
		expect(chatRows(state, "devs").map((r) => r.title)).toEqual([
			"Juniper",
			"Ledger",
		]);
		expect(chatRows(state, "all", "  jun ").map((r) => r.title)).toEqual([
			"Juniper",
		]);
	});

	test("the Mac's Devs section keeps my personal Dev first, even when another Dev's 1:1 moved last", () => {
		const state = fixture();
		state.messages.push(msg("l2", "ledger-dm", "2026-10-11T09:00:00.000Z"));
		expect(chatRows(state, "devs").map((r) => r.title)).toEqual([
			"Juniper",
			"Ledger",
		]);
		state.chats.push({
			id: "beach",
			title: "Beach",
			kind: "group",
			memberIds: ["me"],
			ownerIds: ["me"],
			devIds: [],
		});
		state.messages.push(msg("b1", "beach", "2026-10-11T10:00:00.000Z"));
		expect(chatRows(state, "groups").map((r) => r.title)).toEqual([
			"Beach",
			"Trip",
		]);
	});

	test("the unread count is the Unread filter's length", () => {
		const state = fixture();
		expect(unreadChatCount(state)).toBe(chatRows(state, "unread").length);
		expect(
			unreadChatCount(
				fixture({
					dm: "2026-10-10T10:00:00.000Z",
					trip: "2026-10-10T10:01:00.000Z",
				}),
			),
		).toBe(0);
	});
});

describe("questions waiting on me", () => {
	const question = (q: Partial<Question> = {}): Question =>
		({
			id: "q1",
			devId: "wren",
			taskId: null,
			kind: "select",
			title: "Which cuisine?",
			body: "",
			options: [],
			allowOther: false,
			placeholder: "",
			forUserId: null,
			status: "open",
			answer: null,
			typed: false,
			answeredBy: null,
			...q,
		}) as Question;
	/** Wren asks in Trip, everything read. */
	const asked = (q: Partial<Question> = {}): ChatState => {
		const state = fixture({
			dm: "2026-10-10T10:00:00.000Z",
			trip: "2026-10-10T12:00:00.000Z",
		});
		return {
			...state,
			messages: [
				...state.messages,
				msg("q-msg", "trip", "2026-10-10T12:00:00.000Z", {
					authorId: null,
					authorDevId: "wren",
					text: "",
					question: question(q),
				}),
			],
		};
	};
	const trip = (state: ChatState, filter: "all" | "unread" = "all") =>
		chatRows(state, filter).find((r) => r.chat.id === "trip");

	test("an open question for me flags the chat and counts as unread, though every message is read", () => {
		const state = asked();
		expect(trip(state)).toMatchObject({
			unread: 0,
			asking: "Wren asked: Which cuisine?",
			preview: "Wren: Asks: Which cuisine?",
		});
		expect(chatRows(state, "unread").map((r) => r.title)).toEqual(["Trip"]);
		expect(unreadChatCount(state)).toBe(1);
	});

	test("a question for someone else, or one already answered, doesn't", () => {
		expect(trip(asked({ forUserId: "priya" }))?.asking).toBeNull();
		expect(
			trip(asked({ status: "answered", answer: "Thai", answeredBy: "me" }))
				?.asking,
		).toBeNull();
		expect(trip(asked({ forUserId: "priya" }), "unread")).toBeUndefined();
	});
});
