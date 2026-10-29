import { describe, expect, it } from "bun:test";
import { setupPrompt } from "./setupPrompt";

describe("setupPrompt", () => {
	it("names the environment skill, links the environment, and rules out a fallback", () => {
		expect(setupPrompt("https://app.superset.sh/environments/e1")).toBe(
			"Use the superset:environment skill to set up the cloud environment https://app.superset.sh/environments/e1\n\nIf that skill is not available, stop and tell me. Do not set up the environment another way.",
		);
	});
});
