import { describe, expect, test } from "bun:test";
import { splitQuotedText } from "./emailHtml";

describe("splitQuotedText", () => {
	test("splits at Gmail's attribution line", () => {
		expect(
			splitQuotedText(
				"Sounds good.\n\nOn Thu, Oct 2, 2026 at 9:01 AM Satya Patel <satya@superset.sh> wrote:\n> Tuesday?\n>",
			),
		).toEqual({
			body: "Sounds good.",
			quoted:
				"On Thu, Oct 2, 2026 at 9:01 AM Satya Patel <satya@superset.sh> wrote:\n> Tuesday?\n>",
		});
	});

	test("leaves a message without a quote whole, and a quote-only message unsplit", () => {
		expect(splitQuotedText("Just text.")).toEqual({
			body: "Just text.",
			quoted: null,
		});
		expect(splitQuotedText("> only quoted")).toEqual({
			body: "> only quoted",
			quoted: null,
		});
	});
});
