import { describe, expect, it } from "bun:test";
import { failedCreatePrompt } from "./failedCreatePrompt";

const base = {
	id: "11111111-1111-1111-1111-111111111111",
	projectId: "22222222-2222-2222-2222-222222222222",
};

describe("failedCreatePrompt", () => {
	it("returns the prompt sent to the agent", () => {
		expect(
			failedCreatePrompt({
				...base,
				agents: [{ agent: "claude", prompt: "Fix the views", mode: "auto" }],
			}),
		).toBe("Fix the views");
	});

	it("falls back to the naming prompt", () => {
		expect(
			failedCreatePrompt({ ...base, namingPrompt: "Rename the sidebar" }),
		).toBe("Rename the sidebar");
	});

	it("returns null when nothing was typed", () => {
		expect(failedCreatePrompt(base)).toBeNull();
		expect(
			failedCreatePrompt({
				...base,
				agents: [{ agent: "claude", prompt: " " }],
			}),
		).toBeNull();
	});
});
