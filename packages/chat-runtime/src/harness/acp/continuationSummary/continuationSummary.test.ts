import { describe, expect, it } from "bun:test";
import { continuationSummary } from "./continuationSummary";

describe("continuationSummary", () => {
	it("keeps only the summary from the continuation message, tool reminder included", () => {
		const text = [
			"This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.",
			"",
			"<system-reminder>",
			"<tools-used-before-summary>Bash</tools-used-before-summary>",
			"</system-reminder>",
			"",
			"Summary:",
			"1. Primary Request and Intent:",
			"   - Read README.md.",
			"",
			"If you need specific details from before compaction, read the full transcript.",
			"Continue the conversation from where it left off without asking the user any further questions.",
		].join("\n");

		expect(continuationSummary(text)).toBe(
			"1. Primary Request and Intent:\n   - Read README.md.",
		);
		expect(
			continuationSummary(
				"This session is being continued from a previous conversation that ran out of context.\nSummary:\nRead the readme.\n\nPlease continue the conversation from where we left it off without asking the user any further questions.",
			),
		).toBe("Read the readme.");
	});

	it("leaves an ordinary user message alone", () => {
		expect(continuationSummary("Summary: what changed today?")).toBeUndefined();
	});
});
