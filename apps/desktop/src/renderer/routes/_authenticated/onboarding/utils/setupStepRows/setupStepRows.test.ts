import { describe, expect, test } from "bun:test";
import {
	agentsStillMissing,
	needsSetupStep,
	setupStepRows,
} from "./setupStepRows";

const GIT_OK = { installed: true };
const GIT_MISSING = { installed: false };
const GH_READY = { installed: true, authenticated: true };
const GH_SIGNED_OUT = { installed: true, authenticated: false };
const GH_MISSING = { installed: false, authenticated: false };
const INSTALLED = { installed: true };
const MISSING = { installed: false };
const NO_AGENT_ROWS = { claude: false, codex: false };
const MAC = "darwin";

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
			const expected = { ...rows, ...NO_AGENT_ROWS };
			expect(setupStepRows({ git, gh, platform: MAC })).toEqual(expected);
			expect(needsSetupStep(expected)).toBe(true);
		}
	});

	test("skips the step when nothing is missing or detection failed", () => {
		for (const status of [
			{ git: GIT_OK, gh: GH_READY, platform: MAC },
			{ git: undefined, gh: undefined, platform: MAC },
			{
				git: GIT_OK,
				gh: GH_READY,
				claude: INSTALLED,
				codex: INSTALLED,
				platform: MAC,
			},
			{
				git: GIT_OK,
				gh: GH_READY,
				claude: undefined,
				codex: undefined,
				platform: MAC,
			},
		]) {
			expect(needsSetupStep(setupStepRows(status))).toBe(false);
		}
	});

	test("one installed agent is enough: agent rows show only when neither is installed", () => {
		const cases = [
			[MISSING, MISSING, { claude: true, codex: true }],
			[MISSING, INSTALLED, NO_AGENT_ROWS],
			[INSTALLED, MISSING, NO_AGENT_ROWS],
			[INSTALLED, INSTALLED, NO_AGENT_ROWS],
		] as const;
		for (const [claude, codex, rows] of cases) {
			const result = setupStepRows({
				git: GIT_OK,
				gh: GH_READY,
				claude,
				codex,
				platform: MAC,
			});
			expect(result).toEqual({ git: false, gitHub: false, ...rows });
			expect(needsSetupStep(result)).toBe(rows.claude);
		}
	});

	test("shows no Git or agent rows off macOS, where Paradev can't install them", () => {
		for (const platform of ["linux", "win32"]) {
			expect(
				setupStepRows({
					git: GIT_MISSING,
					gh: GH_READY,
					claude: MISSING,
					codex: MISSING,
					platform,
				}),
			).toEqual({ git: false, gitHub: false, ...NO_AGENT_ROWS });
		}
	});
});

describe("agentsStillMissing", () => {
	const rows = { git: false, gitHub: false, claude: true, codex: true };

	test("names every shown agent while none is installed", () => {
		expect(
			agentsStillMissing(rows, { claude: MISSING, codex: MISSING }),
		).toEqual(["claude", "codex"]);
	});

	test("is empty once any agent is installed", () => {
		expect(
			agentsStillMissing(rows, { claude: INSTALLED, codex: MISSING }),
		).toEqual([]);
	});
});
