import { expect, test } from "bun:test";
import { unresolvedPollDelay } from "./unresolvedPollDelay";

test("a chat with no message yet is polled less often, up to once a minute", () => {
	expect(unresolvedPollDelay(0)).toBe(false);
	expect([1, 2, 3, 4, 5, 6, 7, 50].map(unresolvedPollDelay)).toEqual([
		2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
	]);
});
