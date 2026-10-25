import { describe, expect, it } from "bun:test";
import type { TurnGroup } from "@superset/chat/core";
import { timelineBefore } from "./messageEdit";

function userItem(id: string, text: string, startedAtMs: number) {
	return {
		kind: "item" as const,
		item: {
			id,
			kind: "user_message" as const,
			startedAtMs,
			content: [{ type: "text" as const, text }],
		},
	};
}

function agentItem(id: string) {
	return {
		kind: "item" as const,
		item: { id, kind: "agent_message" as const, startedAtMs: 0 },
	};
}

const groups = [
	{
		turnId: "t1",
		turn: null,
		entries: [userItem("u1", "first", 1), agentItem("a1")],
	},
	{
		turnId: "t2",
		turn: null,
		entries: [
			userItem("u2", "second", 2),
			agentItem("a2"),
			userItem("u3", "steer", 3),
		],
	},
] as unknown as TurnGroup[];

describe("messageEdit", () => {
	it("keeps only what came before the chosen message", () => {
		expect(timelineBefore(groups, "u1")).toEqual([]);
		expect(timelineBefore(groups, "u2")).toEqual([groups[0]] as TurnGroup[]);
		const beforeSteer = timelineBefore(groups, "u3");
		expect(beforeSteer).toHaveLength(2);
		expect(
			beforeSteer[1]?.entries.map(
				(entry) => entry.kind === "item" && entry.item.id,
			),
		).toEqual(["u2", "a2"]);
	});
});
