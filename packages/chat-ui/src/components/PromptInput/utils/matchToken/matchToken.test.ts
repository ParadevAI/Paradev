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

	test("ends the query at a bracket it did not open", () => {
		expect(matchToken("(cc @alice)", "@")).toBeNull();
		expect(matchToken("see #general]", "#")).toBeNull();
		expect(matchToken("(see @app/(group)", "@")?.matchingString).toBe(
			"app/(group)",
		);
	});
});
