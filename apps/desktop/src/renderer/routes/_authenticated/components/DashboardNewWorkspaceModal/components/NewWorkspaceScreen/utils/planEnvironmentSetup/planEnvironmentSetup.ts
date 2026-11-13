export interface PendingEnvironmentSetup {
	/** The project (or no-project key) the environment was made for. */
	choiceKey: string;
	environmentId: string;
}

export type EnvironmentSetupPlan<Repository> =
	| { kind: "reuse"; environmentId: string }
	| { kind: "create"; repository: Repository }
	| { kind: "dialog" };

/**
 * What submitting does on the cloud: retry setup on the environment made
 * earlier whose workspace never started (until the list catches up it is not
 * selected yet), make one from the project's repository, or ask through the
 * dialog. Null when the selected environment is ready to use.
 */
export function planEnvironmentSetup<Repository>({
	pending,
	choiceKey,
	selectedEnvironmentId,
	needsEnvironment,
	repository,
}: {
	pending: PendingEnvironmentSetup | null;
	choiceKey: string;
	selectedEnvironmentId: string | null;
	needsEnvironment: boolean;
	repository: Repository | undefined;
}): EnvironmentSetupPlan<Repository> | null {
	if (
		pending?.choiceKey === choiceKey &&
		(selectedEnvironmentId === null ||
			selectedEnvironmentId === pending.environmentId)
	) {
		return { kind: "reuse", environmentId: pending.environmentId };
	}
	if (!needsEnvironment) return null;
	return repository ? { kind: "create", repository } : { kind: "dialog" };
}
