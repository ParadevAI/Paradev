import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Question, Task } from "../model/model.ts";
import { isOwnFollowUp, taskCardInfo, taskTabInfo } from "./task-card.ts";

const task = (fields: Partial<Task> = {}): Task => ({
	id: "t1",
	chatId: "g",
	title: "Book Sintra train tickets",
	description: "",
	status: "todo",
	assigneeId: null,
	assigneeDevId: null,
	due: null,
	scheduledAt: null,
	remind: false,
	repeat: null,
	createdAt: "2026-10-13T09:00:00.000Z",
	...fields,
});

const question: Question = {
	id: "q1",
	devId: "scout",
	taskId: "t1",
	kind: "confirm",
	title: "Second class?",
	body: "",
	options: [],
	allowOther: false,
	placeholder: "",
	forUserId: null,
	status: "open",
	answer: null,
	typed: false,
	answeredBy: null,
	answeredAt: null,
	expiresAt: "2026-10-13T09:10:00.000Z",
};

const state = (fields: Partial<ChatState> = {}): ChatState => ({
	meId: "u1",
	members: {
		u1: { id: "u1", name: "Harshith" },
		u2: { id: "u2", name: "Leo" },
	},
	devs: {
		scout: {
			id: "scout",
			kind: "group",
			name: "Scout",
			color: "#2F6F6A",
			ownerId: null,
			description: "",
		},
	},
	chats: [
		{
			id: "g",
			title: "Lisbon trip",
			kind: "group",
			memberIds: ["u1", "u2"],
			ownerIds: ["u1"],
			devIds: ["scout"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
	...fields,
});

describe("task cards", () => {
	test("to do and done say nothing beyond the ring; the person who has it is named", () => {
		expect(taskCardInfo(state(), task({ assigneeId: "u2" }))).toEqual({
			done: false,
			status: null,
			waiting: false,
			working: false,
			assignee: { kind: "user", id: "u2", name: "Leo" },
		});
		expect(
			taskCardInfo(state(), task({ status: "done", assigneeId: "u1" })),
		).toMatchObject({ done: true, status: null, assignee: { name: "You" } });
	});

	test("a Dev with the task in progress is working on it; a person in progress isn't shown live", () => {
		expect(
			taskCardInfo(
				state(),
				task({ status: "in_progress", assigneeDevId: "scout" }),
			),
		).toMatchObject({
			status: "In progress",
			working: true,
			assignee: { kind: "dev", name: "Scout" },
		});
		expect(
			taskCardInfo(state(), task({ status: "in_progress", assigneeId: "u2" })),
		).toMatchObject({ status: "In progress", working: false });
	});

	test("a Dev waiting on a question about the task says so instead of working", () => {
		const asked = state({
			messages: [
				{
					id: "m1",
					chatId: "g",
					authorId: null,
					authorDevId: "scout",
					text: "",
					at: "2026-10-13T09:00:00.000Z",
					question,
				},
			],
		});
		expect(
			taskCardInfo(
				asked,
				task({ status: "in_progress", assigneeDevId: "scout" }),
			),
		).toMatchObject({
			status: "Waiting for your answer",
			waiting: true,
			working: false,
		});
	});

	test("a task a Dev gave itself is its own follow-up; one it gave another, or a person's, isn't", () => {
		expect(
			isOwnFollowUp({ authorDevId: "scout" }, task({ assigneeDevId: "scout" })),
		).toBe(true);
		expect(
			isOwnFollowUp({ authorDevId: "scout" }, task({ assigneeDevId: "jev" })),
		).toBe(false);
		expect(
			isOwnFollowUp({ authorDevId: "scout" }, task({ assigneeId: "u1" })),
		).toBe(false);
		expect(isOwnFollowUp({}, task({ assigneeDevId: null }))).toBe(false);
	});
});

describe("the tab under a Dev's message", () => {
	test("one task it gave itself is its follow-up; one it gave someone else goes by its title", () => {
		expect(
			taskTabInfo({ authorDevId: "scout" }, [task({ assigneeDevId: "scout" })]),
		).toEqual({ count: 1, done: 0, label: "Follow-up" });
		expect(
			taskTabInfo({ authorDevId: "scout" }, [
				task({ assigneeId: "u1", status: "done" }),
			]),
		).toEqual({ count: 1, done: 1, label: "Book Sintra train tickets" });
	});

	test("several say how many and how many are done", () => {
		const tasks = [
			task({ id: "a" }),
			task({ id: "b", status: "done" }),
			task({ id: "c" }),
			task({ id: "d" }),
		];
		expect(taskTabInfo({ authorDevId: "scout" }, tasks)).toEqual({
			count: 4,
			done: 1,
			label: "4 tasks",
		});
	});
});
