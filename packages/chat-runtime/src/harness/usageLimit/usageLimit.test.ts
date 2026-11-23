import { expect, test } from "bun:test";
import { isClaudeUsageError, isClaudeUsageRefusal } from "./usageLimit";

test("Claude's usage refusals are known by the CLI's own wording, with or without the ACP error label", () => {
	expect(
		isClaudeUsageRefusal(
			"Internal error: You've hit your Fable limit · resets Nov 24 at 2pm (America/Los_Angeles).",
		),
	).toBe(true);
	expect(
		isClaudeUsageRefusal("Your seat type doesn't include usage credits"),
	).toBe(true);
	expect(
		isClaudeUsageRefusal("Internal error: API Error: 529 Overloaded"),
	).toBe(false);
});

test("the CLI's wording counts only on an error the Claude agent marked as a rate limit or billing failure", () => {
	const refusal = "Internal error: You've hit your Fable limit · resets 2pm";
	expect(isClaudeUsageError({ errorKind: "rate_limit" }, refusal)).toBe(true);
	expect(isClaudeUsageError({ errorKind: "billing_error" }, refusal)).toBe(
		true,
	);
	expect(
		isClaudeUsageError(
			{ errorKind: "rate_limit" },
			"Internal error: API Error: 429 This request would exceed your organization's rate limit",
		),
	).toBe(false);
	expect(isClaudeUsageError({ errorKind: "invalid_request" }, refusal)).toBe(
		false,
	);
	for (const data of [undefined, null, "rate_limit", [], {}]) {
		expect(
			isClaudeUsageError(data, "You've reached your maximum context length"),
		).toBe(false);
	}
});
