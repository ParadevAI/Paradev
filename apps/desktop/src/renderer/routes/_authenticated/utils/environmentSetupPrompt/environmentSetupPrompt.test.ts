import { describe, expect, it } from "bun:test";
import {
	environmentSetupAgentPrompt,
	withEnvironmentSetupSkill,
} from "./environmentSetupPrompt";

const URL = "https://app.superset.sh/environments/e1";
const SET_UP = `Use the superset:environment skill to set up the cloud environment ${URL}. You are already in a box on that environment, so set it up here instead of starting another box.`;

describe("withEnvironmentSetupSkill", () => {
	it("sends the user's message, then the setup request", () => {
		expect(withEnvironmentSetupSkill("  add dark mode \n", URL)).toBe(
			`add dark mode\n\n${SET_UP}`,
		);
	});

	it("is the setup request alone when nothing was typed", () => {
		expect(withEnvironmentSetupSkill("   ", URL)).toBe(SET_UP);
	});
});

describe("environmentSetupAgentPrompt", () => {
	it("asks for a working environment, then names the skill for this box", () => {
		expect(environmentSetupAgentPrompt(URL)).toBe(
			`Set up a new development environment for this codebase. Run the relevant applications and demonstrate that the environment works end to end.\n\n${SET_UP}`,
		);
	});
});
