import { expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { TaskActivity } from "../model/model.ts";
import { whenLabel } from "../task-time/task-time.ts";
import { activityLine } from "./task-activity-line.ts";

const state: ChatState = {
	meId: "u1",
	members: { u1: { id: "u1", name: "Alice" }, u2: { id: "u2", name: "Bob" } },
	devs: {
		m1: {
			id: "m1",
			kind: "personal",
			name: "Juniper",
			color: "#4E7AC7",
			ownerId: "u1",
			description: "",
		},
	},
	chats: [],
	messages: [],
	tasks: [],
	apps: [],
};
const now = new Date(2026, 9, 12, 14, 30);
const entry = (overrides: Partial<TaskActivity>): TaskActivity => ({
	id: "a",
	taskId: "t",
	kind: "created",
	text: "",
	actor: { kind: "user", id: "u1" },
	at: now.toISOString(),
	...overrides,
});
const bob = { kind: "user" as const, id: "u2" };

test("events name who did them and whom they gave it to", () => {
	expect(activityLine(state, entry({}), now)).toEqual({
		who: { kind: "user", id: "u1", name: "You" },
		text: "created the task",
		tone: "event",
	});
	expect(
		activityLine(
			state,
			entry({ kind: "assigned", text: "m1", actor: bob }),
			now,
		),
	).toEqual({
		who: { kind: "user", id: "u2", name: "Bob" },
		text: "assigned it to Juniper",
		tone: "event",
	});
	expect(
		activityLine(
			state,
			entry({ kind: "assigned", text: "u1", actor: bob }),
			now,
		).text,
	).toBe("assigned it to you");
	expect(
		activityLine(state, entry({ kind: "assigned", text: "u1" }), now).text,
	).toBe("took it");
	expect(
		activityLine(state, entry({ kind: "assigned", text: "", actor: bob }), now)
			.text,
	).toBe("assigned it to nobody");
});

test("a Dev starting, its notes and failures", () => {
	const dev = { kind: "dev" as const, id: "m1" };
	expect(
		activityLine(state, entry({ kind: "started", actor: dev }), now),
	).toMatchObject({
		who: { kind: "dev", id: "m1", name: "Juniper", color: "#4E7AC7" },
		text: "started working on it",
	});
	expect(
		activityLine(
			state,
			entry({ kind: "progress", text: "Found 3 venues", actor: dev }),
			now,
		),
	).toMatchObject({ text: "Found 3 venues", tone: "work" });
	expect(
		activityLine(
			state,
			entry({ kind: "comment", text: "Prefer mornings", actor: bob }),
			now,
		),
	).toMatchObject({ text: "Prefer mornings", tone: "comment" });
	expect(
		activityLine(
			state,
			entry({
				kind: "failed",
				text: "Its Dev isn't in this chat anymore",
				actor: null,
			}),
			now,
		),
	).toEqual({
		who: null,
		text: "Its Dev isn't in this chat anymore",
		tone: "failed",
	});
});

test("status changes, edits, schedules", () => {
	expect(
		activityLine(state, entry({ kind: "status", text: "needs_review" }), now)
			.text,
	).toBe("moved it to Needs review");
	expect(
		activityLine(state, entry({ kind: "edited", text: "title" }), now).text,
	).toBe("changed the title");
	const at = new Date(2026, 9, 13, 10, 0).toISOString();
	expect(
		activityLine(state, entry({ kind: "scheduled", text: at }), now).text,
	).toBe(`set it for ${whenLabel(at, now)}`);
	expect(whenLabel(at, now)).toStartWith("Tomorrow ");
	expect(
		activityLine(state, entry({ kind: "scheduled", text: "" }), now).text,
	).toBe("cleared the time");
});
