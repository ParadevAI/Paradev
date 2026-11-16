import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import { taskAssignee, taskAssigneeOptions } from "./task-assignees.ts";

const state: ChatState = {
	meId: "u1",
	members: {
		u1: { id: "u1", name: "Harshith" },
		u2: { id: "u2", name: "Priya" },
	},
	devs: {
		m1: {
			id: "m1",
			kind: "personal",
			name: "Juniper",
			color: "#111111",
			ownerId: "u1",
			description: "",
		},
		m2: {
			id: "m2",
			kind: "personal",
			name: "Otter",
			color: "#222222",
			ownerId: "u2",
			description: "",
		},
		gm: {
			id: "gm",
			kind: "group",
			name: "Wren",
			color: "#333333",
			ownerId: null,
			description: "",
		},
	},
	chats: [
		{
			id: "dm",
			title: "Juniper",
			kind: "direct",
			memberIds: ["u1"],
			ownerIds: ["u1"],
			devIds: ["m1"],
		},
		{
			id: "g",
			title: "Trip",
			kind: "group",
			memberIds: ["u1", "u2"],
			ownerIds: ["u1"],
			devIds: ["gm", "m1", "m2"],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
};

describe("task assignees", () => {
	test("a 1:1 offers its Dev and you", () => {
		expect(
			taskAssigneeOptions(state, state.chats[0]!).map((a) => a.id),
		).toEqual(["m1", "u1"]);
	});

	test("a group offers its Dev and yours, never another member's Dev", () => {
		expect(
			taskAssigneeOptions(state, state.chats[1]!).map((a) => a.id),
		).toEqual(["gm", "m1", "u1", "u2"]);
	});

	test("names a task's assignee", () => {
		expect(
			taskAssignee(state, { assigneeId: null, assigneeDevId: "gm" }),
		).toMatchObject({ kind: "dev", name: "Wren" });
		expect(
			taskAssignee(state, { assigneeId: "u1", assigneeDevId: null }),
		).toMatchObject({ kind: "user", name: "You" });
		expect(
			taskAssignee(state, { assigneeId: null, assigneeDevId: null }),
		).toBeNull();
	});
});
