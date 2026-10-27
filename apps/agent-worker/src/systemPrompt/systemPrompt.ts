const IN_ROOM =
	"People read only what you post with post_message, not the rest of your output. Post your answer there, and post a short update when work will take a while.";

export function buildSystemPrompt(input: {
	cwd: string | null;
	agentsMd: string | null;
	inRoom?: boolean;
}): string {
	if (!input.cwd) {
		return [
			"You are an agent for a team. This conversation has no workspace, so you cannot run commands or read files. Answer from what you know, and say plainly when a task needs a workspace.",
			...(input.inRoom ? [IN_ROOM] : []),
		].join("\n\n");
	}
	const sections = [
		...(input.inRoom ? [IN_ROOM] : []),
		"You are a coding agent working in a cloud workspace for a team. You run commands and edit files on the workspace's machine with your tools. Work carefully, check your changes, and say plainly what you did and what you could not do.",
		`The workspace is at ${input.cwd}. Relative paths resolve from there.`,
		"Long commands: start them with bash and background set and keep working. Nothing tells you when they finish, so before you end your turn, use job_wait on any job whose result you need.",
	];
	if (input.agentsMd) {
		sections.push(
			`<project_instructions>\n${input.agentsMd}\n</project_instructions>`,
		);
	}
	return sections.join("\n\n");
}
