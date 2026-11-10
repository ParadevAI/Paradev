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
			expect(setupStepRows({ git, gh })).toEqual(expected);
			expect(needsSetupStep(expected)).toBe(true);
		}
	});

	test("skips the step when nothing is missing or detection failed", () => {
		for (const status of [
			{ git: GIT_OK, gh: GH_READY },
			{ git: undefined, gh: undefined },
			{
				git: GIT_OK,
				gh: GH_READY,
				claude: INSTALLED,
				codex: INSTALLED,
				canInstallAgents: true,
			},
			{
				git: GIT_OK,
				gh: GH_READY,
				claude: undefined,
				codex: undefined,
				canInstallAgents: true,
			},
		]) {
			expect(needsSetupStep(setupStepRows(status))).toBe(false);
		}
	});

	test("shows each agent row only when that agent is missing", () => {
		const cases = [
			[MISSING, MISSING, { claude: true, codex: true }],
			[MISSING, INSTALLED, { claude: true, codex: false }],
			[INSTALLED, MISSING, { claude: false, codex: true }],
			[INSTALLED, INSTALLED, { claude: false, codex: false }],
		] as const;
		for (const [claude, codex, rows] of cases) {
			const result = setupStepRows({
				git: GIT_OK,
				gh: GH_READY,
				claude,
				codex,
				canInstallAgents: true,
			});
			expect(result).toEqual({ git: false, gitHub: false, ...rows });
			expect(needsSetupStep(result)).toBe(rows.claude || rows.codex);
		}
	});

	test("offers no agent rows where Paradev can't install agents", () => {
		expect(
			setupStepRows({
				git: GIT_OK,
				gh: GH_READY,
				claude: MISSING,
				codex: MISSING,
			}),
		).toEqual({ git: false, gitHub: false, ...NO_AGENT_ROWS });
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
		expect(
			agentsStillMissing(
				{ ...rows, codex: false },
				{ claude: MISSING, codex: INSTALLED },
			),
		).toEqual([]);
	});
});
