import { describe, expect, test } from "bun:test";
import { splitComparisonFaq } from "./compare-utils";

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
