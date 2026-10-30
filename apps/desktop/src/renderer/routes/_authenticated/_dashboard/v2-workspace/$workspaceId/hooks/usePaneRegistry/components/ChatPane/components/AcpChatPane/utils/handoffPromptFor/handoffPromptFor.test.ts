import { describe, expect, it } from "bun:test";
import { handoffPromptFor } from "./handoffPromptFor";

describe("handoffPromptFor", () => {
	it("is null when there is no conversation to hand over", () => {
		expect(handoffPromptFor("  \n", "Paradev")).toBeNull();
	});

	it("carries the transcript and the source agent", () => {
		const prompt = handoffPromptFor("User: hi", "Paradev");
		expect(prompt).toContain("User: hi");
		expect(prompt).toContain("Paradev");
	});
});
