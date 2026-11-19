import { expect, test } from "bun:test";
import { isSessionNotRunning } from "./isSessionNotRunning";

test("matches the host's answer for a chat it has no agent for", () => {
	expect(
		isSessionNotRunning(
			"chat session 2dda5b20-fb49-48e3-8c03-70a0ac78846d is not running",
		),
	).toBe(true);
});

test("ignores other send failures", () => {
	expect(isSessionNotRunning(null)).toBe(false);
	expect(isSessionNotRunning("Failed to fetch")).toBe(false);
	expect(isSessionNotRunning("prompt abc is not queued")).toBe(false);
});
