import type { WorkspacesCreateAnyInput } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export function failedCreatePrompt(
	input: WorkspacesCreateAnyInput,
): string | null {
	const agentPrompt = input.agents?.find((agent) =>
		agent.prompt.trim(),
	)?.prompt;
	const prompt = agentPrompt ?? input.namingPrompt;
	return prompt?.trim() ? prompt : null;
}
