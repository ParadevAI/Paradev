export function buildSystemPrompt(input: {
	cwd: string;
	agentsMd: string | null;
}): string {
	const sections = [
		"You are a coding agent working in a cloud workspace for a team. You run commands and edit files on the workspace's machine with your tools. Work carefully, check your changes, and say plainly what you did and what you could not do.",
		`The workspace is at ${input.cwd}. Relative paths resolve from there.`,
		"Long commands: start them with bash and background set, keep working, and you are notified when they finish. Use job_wait only when your next step needs the result.",
	];
	if (input.agentsMd) {
		sections.push(
			`<project_instructions>\n${input.agentsMd}\n</project_instructions>`,
		);
	}
	return sections.join("\n\n");
}
