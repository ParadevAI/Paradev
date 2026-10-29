import { describe, expect, it } from "bun:test";
import { setupPrompt } from "./setupPrompt";

describe("setupPrompt", () => {
	it("names the environment skill and links the new environment", () => {
		expect(setupPrompt("https://app.superset.sh/environments/e1")).toBe(
			"Use the superset:environment skill to set up the cloud environment https://app.superset.sh/environments/e1",
		);
	});
});
