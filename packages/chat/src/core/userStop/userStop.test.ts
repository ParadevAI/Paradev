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
	test("a replayed marker message is a stop", () => {
		expect(
			userStopOf(
				userMessage([
					{ type: "text", text: "[Request interrupted by user for tool use]" },
				]),
			),
		).toBe("tool_use");
	});

	test("a marker the user typed in this chat stays a prompt", () => {
		expect(
			userStopOf(
				userMessage([{ type: "text", text: "[Request interrupted by user]" }], {
					clientId: "c1",
				}),
			),
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
			),
		).toBeNull();
		expect(
			userStopOf(
				userMessage([
					{ type: "text", text: "[Request interrupted by user]" },
					{ type: "text", text: "now try again" },
				]),
			),
		).toBeNull();
	});

	test("only a user message can be a stop", () => {
		expect(
			userStopOf({
				id: "a1",
				kind: "agent_message",
				startedAtMs: 1,
				text: "[Request interrupted by user]",
			}),
		).toBeNull();
	});
});
