/** Names the skill rather than running it as a command; the agent loads it. */
export function setupPrompt(environmentUrl: string): string {
	return `Use the superset:environment skill to set up the cloud environment ${environmentUrl}`;
}
