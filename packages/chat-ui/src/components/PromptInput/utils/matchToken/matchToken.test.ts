import { describe, expect, test } from "bun:test";
import { matchToken } from "./matchToken";

describe("matchToken", () => {
	test("keeps route path characters in the query", () => {
		expect(
			matchToken("see @routes/$workspaceId/(group)/[id]/+page", "@")
				?.matchingString,
		).toBe("routes/$workspaceId/(group)/[id]/+page");
	});

	test("ends the query at a space", () => {
		expect(matchToken("@src done", "@")).toBeNull();
	});
});
