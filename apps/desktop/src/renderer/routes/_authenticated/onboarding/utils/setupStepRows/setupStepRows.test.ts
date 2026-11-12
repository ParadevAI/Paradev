import { describe, expect, test } from "bun:test";
import { needsSetupStep, setupStepRows } from "./setupStepRows";

const GIT_OK = { installed: true };
const GIT_MISSING = { installed: false };
const GH_READY = { installed: true, authenticated: true };
const GH_SIGNED_OUT = { installed: true, authenticated: false };
const GH_MISSING = { installed: false, authenticated: false };

describe("setupStepRows", () => {
	test("shows a row only for what is missing, Git and GitHub independently", () => {
		const cases = [
			[GIT_MISSING, GH_MISSING, { git: true, gitHub: true }],
			[GIT_MISSING, GH_SIGNED_OUT, { git: true, gitHub: true }],
			[GIT_MISSING, GH_READY, { git: true, gitHub: false }],
			[GIT_OK, GH_MISSING, { git: false, gitHub: true }],
			[GIT_OK, GH_SIGNED_OUT, { git: false, gitHub: true }],
		] as const;
		for (const [git, gh, rows] of cases) {
			expect(setupStepRows({ git, gh, platform: "darwin" })).toEqual(rows);
			expect(needsSetupStep(rows)).toBe(true);
		}
	});

	test("skips the step when nothing is missing or detection failed", () => {
		for (const status of [
			{ git: GIT_OK, gh: GH_READY, platform: "darwin" },
			{ git: undefined, gh: undefined, platform: "darwin" },
		]) {
			expect(needsSetupStep(setupStepRows(status))).toBe(false);
		}
	});

	test("shows no Git row off macOS, where the project step reports missing Git", () => {
		for (const platform of ["linux", "win32"]) {
			expect(
				setupStepRows({ git: GIT_MISSING, gh: GH_READY, platform }),
			).toEqual({ git: false, gitHub: false });
		}
	});
});
