export type SetupStepAgent = "claude" | "codex";

export const SETUP_STEP_AGENTS: SetupStepAgent[] = ["claude", "codex"];

export interface SetupStepRows {
	git: boolean;
	gitHub: boolean;
	claude: boolean;
	codex: boolean;
}

type InstallStatus = { installed: boolean } | undefined;

export interface SetupStepStatus {
	/** Undefined when detection failed; never blocks on an unknown. */
	git: InstallStatus;
	gh: { installed: boolean; authenticated: boolean } | undefined;
	claude?: InstallStatus;
	codex?: InstallStatus;
	platform: string;
}

/**
 * Each row shows only when that tool is missing. One coding agent is enough,
 * so the agent rows show only when neither is installed. The Git row installs
 * Apple's Command Line Tools and Paradev installs agents itself only on a Mac,
 * so those rows are macOS only; elsewhere the project step says Git is missing.
 */
export function setupStepRows({
	git,
	gh,
	claude,
	codex,
	platform,
}: SetupStepStatus): SetupStepRows {
	const noAgent =
		platform === "darwin" &&
		claude?.installed === false &&
		codex?.installed === false;
	return {
		git: platform === "darwin" && git?.installed === false,
		gitHub: gh !== undefined && !(gh.installed && gh.authenticated),
		claude: noAgent,
		codex: noAgent,
	};
}

export function needsSetupStep(rows: SetupStepRows): boolean {
	return rows.git || rows.gitHub || rows.claude || rows.codex;
}

/** The agent rows still worth a skip warning: none once any agent is installed. */
export function agentsStillMissing(
	rows: SetupStepRows,
	status: Pick<SetupStepStatus, "claude" | "codex">,
): SetupStepAgent[] {
	if (SETUP_STEP_AGENTS.some((agent) => status[agent]?.installed)) return [];
	return SETUP_STEP_AGENTS.filter((agent) => rows[agent]);
}
