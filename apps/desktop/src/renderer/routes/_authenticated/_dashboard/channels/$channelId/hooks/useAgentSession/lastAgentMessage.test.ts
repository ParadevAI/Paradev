import { describe, expect, test } from "bun:test";
import { lastAgentMessage } from "./lastAgentMessage";

describe("lastAgentMessage", () => {
	test("takes the newest agent message that says something", () => {
		const envelopes = [
			{
				ts: 1,
				event: {
					type: "item",
					item: { kind: "agent_message", text: "First." },
				},
			},
			{
				ts: 2,
				event: { type: "item", item: { kind: "tool_call", title: "ls" } },
			},
			{
				ts: 3,
				event: {
					type: "item",
					item: { kind: "agent_message", text: "Second", completedAtMs: 3 },
				},
			},
			{
				ts: 4,
				event: { type: "item", item: { kind: "agent_message", text: "" } },
			},
			{ ts: 5, event: { type: "turn", turn: { status: "completed" } } },
		];
		expect(lastAgentMessage(envelopes)).toEqual({
			text: "Second",
			at: 3,
			complete: true,
			answered: false,
		});
	});

	test("knows when the person has written back", () => {
		const envelopes = [
			{
				ts: 1,
				event: {
					type: "item",
					item: { kind: "agent_message", text: "Keep it?", completedAtMs: 1 },
				},
			},
			{ ts: 2, event: { type: "item", item: { kind: "user_message" } } },
		];
		expect(lastAgentMessage(envelopes)?.answered).toBe(true);
	});

	test("is null when the agent has not spoken", () => {
		expect(
			lastAgentMessage([
				{ ts: 1, event: { type: "item", item: { kind: "user_message" } } },
			]),
		).toBeNull();
	});
});
