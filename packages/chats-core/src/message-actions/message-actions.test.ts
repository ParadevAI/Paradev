import { describe, expect, test } from "bun:test";
import { type ChatState, reduce } from "../chat-state/chat-state.ts";
import type { Message, Question, SharedFile } from "../model/model.ts";
import {
	canDeleteMessage,
	canEditMessage,
	deleteMessageNote,
	lastEditableMessage,
	messageCopyText,
} from "./message-actions.ts";

const state: ChatState = {
	meId: "me",
	members: { me: { id: "me", name: "Me" }, bo: { id: "bo", name: "Bo" } },
	devs: {
		m1: {
			id: "m1",
			kind: "personal",
			name: "Juniper",
			color: "#F2B23E",
			ownerId: "me",
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
			devIds: ["m1"],
		},
		{
			id: "mine",
			title: "Trip",
			kind: "group",
			memberIds: ["me", "bo"],
			ownerIds: ["me"],
			devIds: ["g1"],
		},
		{
			id: "theirs",
			title: "Bo's",
			kind: "group",
			memberIds: ["me", "bo"],
			ownerIds: ["bo"],
			devIds: ["g2"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
};

const message = (chatId: string, author: Partial<Message> = {}): Message => ({
	id: "x",
	chatId,
	authorId: null,
	text: "hi",
	at: "2026-10-13T10:00:00Z",
	...author,
});

describe("canDeleteMessage", () => {
	test("your own messages, anywhere", () => {
		expect(canDeleteMessage(state, message("theirs", { authorId: "me" }))).toBe(
			true,
		);
	});

	test("your Dev's replies and Dev's notes in your 1:1", () => {
		expect(canDeleteMessage(state, message("dm", { authorDevId: "m1" }))).toBe(
			true,
		);
		expect(canDeleteMessage(state, message("dm"))).toBe(true);
	});

	test("a group's owner may delete anyone's message there; a member only their own", () => {
		expect(canDeleteMessage(state, message("mine", { authorId: "bo" }))).toBe(
			true,
		);
		expect(
			canDeleteMessage(state, message("mine", { authorDevId: "g1" })),
		).toBe(true);
		expect(canDeleteMessage(state, message("theirs", { authorId: "bo" }))).toBe(
			false,
		);
		expect(
			canDeleteMessage(state, message("theirs", { authorDevId: "g2" })),
		).toBe(false);
	});

	test("a message still being sent can't be deleted yet", () => {
		expect(
			canDeleteMessage(state, {
				...message("dm", { authorId: "me" }),
				id: "local-123",
			}),
		).toBe(false);
	});
});

describe("delete-message", () => {
	const env = { now: () => new Date(), id: () => "id" };

	test("removes the message but not the task or app it carried", () => {
		const withCard: ChatState = {
			...state,
			messages: [
				message("dm", {
					id: "card",
					authorId: "me",
					taskId: "t1",
				} as Partial<Message>),
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
					createdAt: "",
				},
			],
		};
		const next = reduce(
			withCard,
			{ type: "delete-message", messageId: "card" },
			env,
		);
		expect(next.messages).toHaveLength(0);
		expect(next.tasks).toHaveLength(1);
	});

	test("an unknown message changes nothing", () => {
		expect(
			reduce(state, { type: "delete-message", messageId: "nope" }, env),
		).toBe(state);
	});
});

const FILE: SharedFile = {
	id: "f1",
	chatId: "dm",
	name: "plan.pdf",
	title: "Lisbon plan",
	mime: "application/pdf",
	size: 10,
	sharedBy: null,
	preview: "",
	createdAt: "",
};

describe("messageCopyText", () => {
	test("a message's words, with mentions as names", () => {
		const juniper = "6f1c2a4e-1b2c-4d5e-8f90-123456789abc";
		const named: ChatState = {
			...state,
			devs: { [juniper]: { ...state.devs.m1!, id: juniper } },
		};
		expect(
			messageCopyText(
				named,
				message("mine", { text: `ask <@dev:${juniper}>` }),
			),
		).toBe("ask @Juniper");
	});

	test("a shared task copies as its title", () => {
		const withTask: ChatState = {
			...state,
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
					createdAt: "",
				},
			],
		};
		expect(
			messageCopyText(
				withTask,
				message("dm", { text: "/task Pay rent today", taskId: "t1" }),
			),
		).toBe("Pay rent");
	});

	test("a question copies as asked: its title, body and options", () => {
		const question: Question = {
			id: "q1",
			devId: "m1",
			taskId: null,
			kind: "select",
			title: "Which cuisine?",
			body: "",
			options: [
				{ label: "Thai" },
				{ label: "Italian", description: "near the office" },
			],
			allowOther: false,
			placeholder: "",
			forUserId: null,
			status: "open",
			answer: null,
			typed: false,
			answeredBy: null,
			answeredAt: null,
			expiresAt: "2026-10-13T11:00:00Z",
		};
		expect(
			messageCopyText(
				state,
				message("dm", { text: "Which cuisine?", question }),
			),
		).toBe("Which cuisine?\n\n- Thai\n- Italian — near the office");
		const confirm: Question = {
			...question,
			kind: "confirm",
			title: "Book it?",
			body: "Table for two at 8",
			options: [],
		};
		expect(
			messageCopyText(
				state,
				message("dm", { text: "Book it?", question: confirm }),
			),
		).toBe("Book it?\n\nTable for two at 8");
		const parts = [
			{
				header: "Dates",
				title: "When?",
				options: [{ label: "Oct" }, { label: "Nov" }],
				allowOther: false,
				multiSelect: false,
			},
			{
				header: "Food",
				title: "What to eat?",
				options: [{ label: "Sushi" }],
				allowOther: true,
				multiSelect: true,
			},
		];
		const form: Question = {
			...question,
			kind: "form",
			title: "Dates · Food",
			options: [],
			parts,
		};
		expect(
			messageCopyText(
				state,
				message("dm", { text: "Dates · Food", question: form }),
			),
		).toBe("When?\n- Oct\n- Nov\n\nWhat to eat?\n- Sushi");
	});

	test("a shared file copies as its name, with what was said with it", () => {
		expect(
			messageCopyText(state, message("dm", { text: "", file: FILE })),
		).toBe("Lisbon plan");
		expect(
			messageCopyText(
				state,
				message("dm", { text: "Here you go", file: FILE }),
			),
		).toBe("Lisbon plan\nHere you go");
	});
});

describe("deleteMessageNote", () => {
	test("says the task or saved sketch a card carried stays; a plain message carries nothing", () => {
		const withBoth: ChatState = {
			...state,
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
					createdAt: "",
				},
			],
			apps: [
				{
					id: "a1",
					chatId: "dm",
					name: "Budget",
					description: "",
					color: 1,
					status: "live",
					version: null,
					url: null,
					creatorDevId: null,
					saved: true,
					createdAt: "",
				},
			],
		};
		expect(deleteMessageNote(withBoth, message("dm", { taskId: "t1" }))).toBe(
			"The task “Pay rent” stays.",
		);
		expect(deleteMessageNote(withBoth, message("dm", { appId: "a1" }))).toBe(
			"The sketch Budget stays.",
		);
		expect(deleteMessageNote(withBoth, message("dm"))).toBeNull();
		expect(deleteMessageNote(withBoth, message("dm", { file: FILE }))).toBe(
			"The file Lisbon plan is deleted too.",
		);
	});

	test("an unsaved sketch goes with its message, unless another message carries it too", () => {
		const sketch = {
			id: "a1",
			chatId: "dm",
			name: "Split",
			description: "",
			color: 1,
			status: "live" as const,
			version: null,
			url: null,
			creatorDevId: null,
			saved: false,
			createdAt: "",
		};
		const card = message("dm", { appId: "a1" });
		expect(
			deleteMessageNote({ ...state, apps: [sketch], messages: [card] }, card),
		).toBe("The sketch Split is deleted too.");
		const shared = { ...card, id: "m-shared" };
		expect(
			deleteMessageNote(
				{ ...state, apps: [sketch], messages: [card, shared] },
				card,
			),
		).toBe("The sketch Split stays.");
	});
});

describe("editing a message", () => {
	test("only your own sent text messages", () => {
		expect(canEditMessage(state, message("theirs", { authorId: "me" }))).toBe(
			true,
		);
		expect(canEditMessage(state, message("mine", { authorId: "bo" }))).toBe(
			false,
		);
		expect(canEditMessage(state, message("dm", { authorDevId: "m1" }))).toBe(
			false,
		);
		expect(canEditMessage(state, message("dm"))).toBe(false);
		expect(
			canEditMessage(state, {
				...message("dm", { authorId: "me" }),
				id: "local-1",
			}),
		).toBe(false);
		expect(
			canEditMessage(state, message("dm", { authorId: "me", taskId: "t1" })),
		).toBe(false);
		expect(
			canEditMessage(state, message("dm", { authorId: "me", appId: "a1" })),
		).toBe(false);
		expect(
			canEditMessage(
				state,
				message("dm", {
					authorId: "me",
					call: { startedAt: "2026-10-13T09:00:00Z", durationMs: 1000 },
				}),
			),
		).toBe(false);
	});

	test("↑ edits your latest text message in the chat, past cards and others' messages", () => {
		const messages = [
			{ ...message("dm", { authorId: "me", text: "first" }), id: "a" },
			{ ...message("dm", { authorId: "me", text: "second" }), id: "b" },
			{ ...message("dm", { authorId: "me", taskId: "t1" }), id: "c" },
			{ ...message("dm", { authorDevId: "m1" }), id: "d" },
			{ ...message("mine", { authorId: "me" }), id: "e" },
		];
		expect(lastEditableMessage({ ...state, messages }, "dm")?.id).toBe("b");
		expect(
			lastEditableMessage({ ...state, messages }, "theirs"),
		).toBeUndefined();
	});

	test("an edit changes the words, marks it edited and refreshes the quotes of it", () => {
		const original = {
			...message("dm", { authorId: "me", text: "meet at 5" }),
			id: "o",
		};
		const reply: Message = {
			...message("dm", { authorDevId: "m1", text: "ok" }),
			id: "r",
			replyTo: {
				id: "o",
				authorName: "Me",
				authorKind: "person",
				authorId: "me",
				text: "meet at 5",
			},
		};
		const env = { now: () => new Date("2026-10-13T11:00:00Z"), id: () => "id" };
		const next = reduce(
			{ ...state, messages: [original, reply] },
			{ type: "edit-message", messageId: "o", text: " meet at 6 " },
			env,
		);
		expect(next.messages[0]).toMatchObject({
			text: "meet at 6",
			editedAt: "2026-10-13T11:00:00.000Z",
		});
		expect(next.messages[1]!.replyTo?.text).toBe("meet at 6");
		const same = { ...state, messages: [original] };
		expect(
			reduce(
				same,
				{ type: "edit-message", messageId: "o", text: "meet at 5" },
				env,
			),
		).toBe(same);
		expect(
			reduce(same, { type: "edit-message", messageId: "o", text: "  " }, env),
		).toBe(same);
	});
});
