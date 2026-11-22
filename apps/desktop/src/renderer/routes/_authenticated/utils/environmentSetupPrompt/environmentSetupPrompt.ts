export const ENVIRONMENT_SETUP_PROMPT =
	"Please set up the development environment for this codebase. Run the application(s) and demonstrate that the environment is working.";

export function withEnvironmentSetupSkill(
	prompt: string,
	environmentUrl: string,
): string {
	const setUp = `Use the superset:environment skill to set up the cloud environment ${environmentUrl}. You are already in a box on that environment, so set it up here instead of starting another box.`;
	return [prompt.trim(), setUp].filter(Boolean).join("\n\n");
}

export function environmentSetupAgentPrompt(environmentUrl: string): string {
	return withEnvironmentSetupSkill(
		"Set up a new development environment for this codebase. Run the relevant applications and demonstrate that the environment works end to end.",
		environmentUrl,
	);
}
