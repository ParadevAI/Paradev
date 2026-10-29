import { describe, expect, it } from "bun:test";
import { setupEnvironmentId } from "./setupEnvironmentLink";

const WEB = "https://app.superset.sh";

describe("setupEnvironmentId", () => {
	it("finds the environment a setup prompt links", () => {
		const prompt = `Use the superset:environment skill to set up the cloud environment ${WEB}/environments/e1`;
		expect(setupEnvironmentId(prompt, WEB)).toBe("e1");
	});

	it("ignores an environment link in an ordinary first message", () => {
		expect(setupEnvironmentId(`What is in ${WEB}/environments/e1?`, WEB)).toBe(
			null,
		);
		expect(setupEnvironmentId(null, WEB)).toBe(null);
	});
});
