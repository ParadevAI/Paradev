/** Names the skill rather than running it as a command; the agent loads it. */
export function setupPrompt({
	environmentName,
	environmentId,
	url,
}: {
	environmentName: string;
	environmentId: string;
	url: string;
}): string {
	return `Use the superset:environment skill to set up cloud environment ${environmentName} (${environmentId}): ${url}`;
}
