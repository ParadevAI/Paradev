import { describe, expect, test } from "bun:test";
import {
	compareSearchDescription,
	compareSearchTitle,
	splitComparisonFaq,
} from "./compare-utils";

describe("splitComparisonFaq", () => {
	test("splits the page at the FAQ heading", () => {
		const content = [
			"Intro.",
			"## Verdict",
			"Pick one.",
			"## Frequently Asked Questions",
			"### Is it free?",
			"Yes.",
		].join("\n");

		expect(splitComparisonFaq(content)).toEqual({
			body: "Intro.\n## Verdict\nPick one.",
			faq: "## Frequently Asked Questions\n### Is it free?\nYes.",
		});
	});

	test("keeps the whole page as the body when it has no FAQ", () => {
		const content = "Intro.\n## Verdict\nPick one.";

		expect(splitComparisonFaq(content)).toEqual({ body: content, faq: null });
	});
});

describe("compareSearchTitle", () => {
	test("names the former brand when the title is short", () => {
		expect(compareSearchTitle("Best Orca Alternatives in 2026")).toBe(
			"Best Orca Alternatives in 2026 | Paradev (formerly Superset)",
		);
	});

	test("uses the short former name when the full one does not fit", () => {
		expect(
			compareSearchTitle("How to Run Codex Agents in Parallel Today"),
		).toBe("How to Run Codex Agents in Parallel Today | Paradev (ex-Superset)");
	});

	test("keeps only the current brand when the title is long", () => {
		const title = "Claude Code vs Cursor CLI: Which Terminal Agent Wins";
		expect(compareSearchTitle(title)).toBe(`${title} | Paradev`);
	});
});

describe("compareSearchDescription", () => {
	test("names the former brand at the first mention", () => {
		expect(
			compareSearchDescription("Compare Paradev, Orca, and Paradev Cloud."),
		).toBe("Compare Paradev (formerly Superset), Orca, and Paradev Cloud.");
	});

	test("leaves descriptions without the brand unchanged", () => {
		expect(compareSearchDescription("Compare Orca and Herdr.")).toBe(
			"Compare Orca and Herdr.",
		);
	});
});
