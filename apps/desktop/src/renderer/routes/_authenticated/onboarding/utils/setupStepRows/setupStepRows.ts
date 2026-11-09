export interface SetupStepRows {
	git: boolean;
	gitHub: boolean;
}

export interface SetupStepStatus {
	/** Undefined when detection failed; never blocks on an unknown. */
	git: { installed: boolean } | undefined;
	gh: { installed: boolean; authenticated: boolean } | undefined;
}

/** Each row shows only when that tool is missing. */
export function setupStepRows({ git, gh }: SetupStepStatus): SetupStepRows {
	return {
		git: git?.installed === false,
		gitHub: gh !== undefined && !(gh.installed && gh.authenticated),
	};
}

export function needsSetupStep(rows: SetupStepRows): boolean {
	return rows.git || rows.gitHub;
}
