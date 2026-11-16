import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { ChatRead, Message } from "../model/model.ts";
import {
	myRead,
	readTarget,
	seenReceipt,
	UNREAD_MAX,
	unreadCounts,
	unreadTotal,
	withRead,
} from "./chat-reads.ts";

const at = (minute: number) =>
	`2026-10-15T10:${String(minute).padStart(2, "0")}:00.000Z`;
const msg = (
	id: string,
	chatId: string,
	minute: number,
	author: Partial<Message> = { authorId: "nina" },
): Message => ({
	id,
	chatId,
	authorId: null,
	text: id,
	at: at(minute),
	...author,
});
const read = (
	chatId: string,
	kind: "person" | "dev",
	id: string,
	messageId: string,
	minute: number,
	readMinute = minute + 1,
): ChatRead => ({
	chatId,
	reader: { kind, id },
	messageId,
	messageAt: at(minute),
	at: at(readMinute),
});

const base: ChatState = {
	meId: "me",
	members: {
		me: { id: "me", name: "Me" },
		nina: { id: "nina", name: "Nina" },
		priya: { id: "priya", name: "Priya" },
		sam: { id: "sam", name: "Sam" },
		ola: { id: "ola", name: "Ola" },
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
			id: "trip",
			title: "Trip",
			kind: "group",
			memberIds: ["me", "nina", "priya", "sam", "ola"],
			ownerIds: ["me"],
			devIds: ["wren"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
};

describe("withRead", () => {
	test("a reader's read only moves forward", () => {
		const one = withRead(base, read("trip", "person", "me", "m2", 2));
		expect(myRead(one, "trip")?.messageId).toBe("m2");
		expect(withRead(one, read("trip", "person", "me", "m1", 1))).toBe(one);
		expect(withRead(one, read("trip", "person", "me", "m2", 2))).toBe(one);
		const two = withRead(one, read("trip", "person", "me", "m3", 3));
		expect(two.reads).toHaveLength(1);
		expect(myRead(two, "trip")?.messageId).toBe("m3");
		// Another reader, or another chat, is a read of its own.
		expect(
			withRead(two, read("trip", "dev", "wren", "m1", 1)).reads,
		).toHaveLength(2);
	});
});

describe("unread counts", () => {
	const messages = [
		msg("n1", "trip", 1),
		msg("n2", "trip", 2),
		msg("mine", "trip", 3, { authorId: "me" }),
		msg("note", "trip", 4, { authorId: null }),
		msg("w1", "trip", 5, { authorId: null, authorDevId: "wren" }),
		msg("j1", "dm", 1, { authorId: null, authorDevId: "jun" }),
	];

	test("others' messages and Devs' after the viewer's read; never their own or Dev's notes", () => {
		const state = withRead(
			{ ...base, messages },
			read("trip", "person", "me", "n1", 1),
		);
		expect(unreadCounts(state).get("trip")).toBe(2);
		// A chat never read counts all of them.
		expect(unreadCounts(state).get("dm")).toBe(1);
		expect(
			unreadCounts(withRead(state, read("dm", "person", "me", "j1", 1))).get(
				"dm",
			),
		).toBe(0);
	});

	test("the app icon's badge adds up every chat's", () => {
		const state = withRead(
			{ ...base, messages },
			read("trip", "person", "me", "n1", 1),
		);
		expect(unreadTotal(state)).toBe(3);
		expect(
			unreadTotal(
				withRead(
					withRead(state, read("dm", "person", "me", "j1", 1)),
					read("trip", "person", "me", "w1", 5),
				),
			),
		).toBe(0);
	});

	test("stop at 99", () => {
		const many = Array.from({ length: 150 }, (_, i) => ({
			...msg(`m${i}`, "trip", 0),
			at: `2026-10-15T11:00:00.${String(i).padStart(3, "0")}Z`,
		}));
		expect(unreadCounts({ ...base, messages: many }).get("trip")).toBe(
			UNREAD_MAX,
		);
	});
});

describe("readTarget", () => {
	test("the chat's newest message the server has, until it's read", () => {
		const state = {
			...base,
			messages: [
				msg("n1", "trip", 1),
				msg("n2", "trip", 2),
				{ ...msg("local-1", "trip", 3, { authorId: "me" }) },
			],
		};
		expect(readTarget(state, "trip")?.id).toBe("n2");
		expect(
			readTarget(
				withRead(state, read("trip", "person", "me", "n2", 2)),
				"trip",
			),
		).toBeNull();
		expect(readTarget(state, "dm")).toBeNull();
	});
});

describe("seenReceipt", () => {
	const time = (iso: string) => iso.slice(11, 16);

	test("a 1:1 says when its Dev saw the viewer's latest message", () => {
		const state = {
			...base,
			messages: [msg("q", "dm", 1, { authorId: "me" })],
		};
		expect(seenReceipt(state, "dm", time)).toBeNull();
		expect(
			seenReceipt(
				withRead(state, read("dm", "dev", "jun", "q", 1, 2)),
				"dm",
				time,
			),
		).toEqual({ messageId: "q", label: "Seen 10:02" });
	});

	test("a group says who read it and when, in the order they did, at most three names", () => {
		let state: ChatState = {
			...base,
			messages: [
				msg("old", "trip", 1),
				msg("q", "trip", 2, { authorId: "me" }),
			],
		};
		// A read of an earlier message, or the viewer's own, isn't one.
		state = withRead(state, read("trip", "person", "nina", "old", 1));
		state = withRead(state, read("trip", "person", "me", "q", 2));
		expect(seenReceipt(state, "trip", time)).toBeNull();
		state = withRead(state, read("trip", "person", "priya", "q", 2, 5));
		state = withRead(state, read("trip", "dev", "wren", "q", 2, 3));
		expect(seenReceipt(state, "trip", time)?.label).toBe(
			"Seen by Wren 10:03, Priya 10:05",
		);
		state = withRead(state, read("trip", "person", "nina", "q", 2, 6));
		state = withRead(state, read("trip", "person", "sam", "q", 2, 7));
		state = withRead(state, read("trip", "person", "ola", "q", 2, 8));
		expect(seenReceipt(state, "trip", time)?.label).toBe(
			"Seen by Wren 10:03, Priya 10:05, Nina 10:06 +2",
		);
	});

	test("only under the viewer's message when it's the chat's latest", () => {
		const state = withRead(
			{
				...base,
				messages: [
					msg("q", "trip", 1, { authorId: "me" }),
					msg("a", "trip", 2),
				],
			},
			read("trip", "person", "nina", "a", 2),
		);
		expect(seenReceipt(state, "trip", time)).toBeNull();
	});
});
