import { describe, expect, test } from "bun:test";
import { fillClause, planSentence } from "./handoffPlan";

describe("fillClause", () => {
	test("puts the reader's words in for the marks", () => {
		expect(
			fillClause('file "{title}" in Agent Test', { title: "Login loops" }),
		).toBe('file "Login loops" in Agent Test');
	});

	test("keeps braces the reader typed", () => {
		expect(fillClause('file "{title}"', { title: "{to} is empty" })).toBe(
			'file "{to} is empty"',
		);
	});
});

describe("planSentence", () => {
	test("nothing left to write asks nothing", () => {
		expect(planSentence([])).toBeUndefined();
	});

	test("names every write in order", () => {
		expect(
			planSentence([
				"make a Gmail draft to avery@lumenlabs.example",
				'file "Ship it" in Agent Test',
				"send the Slack message",
			]),
		).toBe(
			'Make a Gmail draft to avery@lumenlabs.example, then file "Ship it" in Agent Test, then send the Slack message?',
		);
	});
});
