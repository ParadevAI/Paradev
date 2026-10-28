import { describe, expect, it } from "bun:test";
import { setupPrompt } from "./setupPrompt";

describe("setupPrompt", () => {
	it("names the environment skill and the new environment", () => {
		expect(
			setupPrompt({
				environmentName: "web",
				environmentId: "e1",
				url: "https://app.superset.sh/environments/e1",
			}),
		).toBe(
			"Use the superset:environment skill to set up cloud environment web (e1): https://app.superset.sh/environments/e1",
		);
	});
});
