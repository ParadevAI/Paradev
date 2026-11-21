import { expect, test } from "bun:test";
import { notRunningSessionId, sessionNotRunningMessage } from "./errors";

test("reads the chat back from the host's not-running refusal", () => {
	expect(notRunningSessionId(sessionNotRunningMessage("chat-1"))).toBe(
		"chat-1",
	);
});

test("ignores other errors", () => {
	expect(notRunningSessionId(null)).toBeNull();
	expect(notRunningSessionId("Failed to fetch")).toBeNull();
	expect(notRunningSessionId("prompt abc is not queued")).toBeNull();
});
