type AgentLaunch = { agent: string; prompt: string };

export type MachineWorkspaceRequest =
	| {
			procedure: "createSession";
			input: { agents: AgentLaunch[]; namingPrompt: string };
	  }
	| {
			procedure: "createLocal";
			input: { projectId: string; agents: AgentLaunch[] };
	  }
	| {
			procedure: "create";
			input: { projectId: string; agents: AgentLaunch[]; namingPrompt: string };
	  };

/** A project of several repositories has no single checkout to share, so it gets its own worktrees. */
export function machineWorkspaceRequest(
	project: { id: string; repositoryCount: number } | null,
	prompt: string,
	agent: string,
): MachineWorkspaceRequest {
	const agents = [{ agent, prompt }];
	if (!project) {
		return {
			procedure: "createSession",
			input: { agents, namingPrompt: prompt },
		};
	}
	if (project.repositoryCount > 1) {
		return {
			procedure: "create",
			input: { projectId: project.id, agents, namingPrompt: prompt },
		};
	}
	return { procedure: "createLocal", input: { projectId: project.id, agents } };
}
