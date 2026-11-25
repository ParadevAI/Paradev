import { describe, expect, test } from "bun:test";
import type { Item, UserMessage } from "../../protocol/items";
import { userStopMarker, userStopOf } from "./userStop";

function userMessage(
	content: UserMessage["content"],
	extra: Partial<UserMessage> = {},
): Item {
	return { id: "u1", kind: "user_message", startedAtMs: 1, content, ...extra };
}

describe("userStopMarker", () => {
	test("reads both Claude Code markers", () => {
		expect(userStopMarker("[Request interrupted by user]")).toBe("response");
		expect(userStopMarker("[Request interrupted by user for tool use]")).toBe(
			"tool_use",
		);
	});

	test("allows whitespace around the marker", () => {
		expect(userStopMarker("[Request interrupted by user]\n")).toBe("response");
		expect(
			userStopMarker("  \n[Request interrupted by user for tool use]\n "),
		).toBe("tool_use");
	});

	test("anything else is not a stop", () => {
		expect(userStopMarker("")).toBeNull();
		expect(userStopMarker("Request interrupted by user")).toBeNull();
		expect(userStopMarker("[request interrupted by user]")).toBeNull();
		expect(
			userStopMarker("why did you print [Request interrupted by user]?"),
		).toBeNull();
		expect(userStopMarker("constructor")).toBeNull();
	});
});

describe("userStopOf", () => {
	const stop = userMessage([
		{ type: "text", text: "[Request interrupted by user for tool use]" },
	]);

	test("a replayed marker message in a Claude session is a stop", () => {
		expect(userStopOf(stop, "claude-acp")).toBe("tool_use");
		expect(userStopOf(stop, "claude-code")).toBe("tool_use");
	});

	test("the same text in another harness, or before the harness is known, stays a prompt", () => {
		expect(userStopOf(stop, "codex-acp")).toBeNull();
		expect(userStopOf(stop, undefined)).toBeNull();
	});

	test("a marker the user typed or the parent agent sent stays a prompt", () => {
		const text = [
			{ type: "text" as const, text: "[Request interrupted by user]" },
		];
		expect(
			userStopOf(userMessage(text, { clientId: "c1" }), "claude-acp"),
		).toBeNull();
		expect(
			userStopOf(userMessage(text, { from: "parent" }), "claude-acp"),
		).toBeNull();
	});

	test("a marker with an attachment or more text stays a prompt", () => {
		expect(
			userStopOf(
				userMessage([
					{ type: "text", text: "[Request interrupted by user]" },
					{
						type: "attachment",
						attachmentId: "a1",
						name: "shot.png",
						mimeType: "image/png",
					},
				]),
				"claude-acp",
			),
		).toBeNull();
		expect(
			userStopOf(
				userMessage([
					{ type: "text", text: "[Request interrupted by user]" },
					{ type: "text", text: "now try again" },
				]),
				"claude-acp",
			),
		).toBeNull();
	});

	test("only a user message can be a stop", () => {
		expect(
			userStopOf(
				{
					id: "a1",
					kind: "agent_message",
					startedAtMs: 1,
					text: "[Request interrupted by user]",
				},
				"claude-acp",
			),
		).toBeNull();
	});
});
