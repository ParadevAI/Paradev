export interface SetupStepRows {
	git: boolean;
	gitHub: boolean;
}

export interface SetupStepStatus {
	/** Undefined when detection failed; never blocks on an unknown. */
	git: { installed: boolean } | undefined;
	gh: { installed: boolean; authenticated: boolean } | undefined;
	platform: string;
}

/**
 * Each row shows only when that tool is missing. The Git row installs Apple's
 * Command Line Tools, so it is macOS only; elsewhere the project step says Git is missing.
 */
export function setupStepRows({
	git,
	gh,
	platform,
}: SetupStepStatus): SetupStepRows {
	return {
		git: platform === "darwin" && git?.installed === false,
		gitHub: gh !== undefined && !(gh.installed && gh.authenticated),
	};
}

export function needsSetupStep(rows: SetupStepRows): boolean {
	return rows.git || rows.gitHub;
}
