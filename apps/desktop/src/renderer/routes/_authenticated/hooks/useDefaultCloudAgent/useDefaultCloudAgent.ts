import { useMemo } from "react";
import { useCloudAgentChoices } from "renderer/hooks/useCloudAgentChoices";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";

/** The agent a cloud workspace starts with when nobody picked one: the last one chosen on the new-workspace screen, else the first offered. */
export function useDefaultCloudAgent(): string | null {
	const agents = useCloudAgentChoices();
	return useMemo(() => {
		const saved = window.localStorage.getItem(AGENT_STORAGE_KEY);
		return (
			agents.find((agent) => agent.id === saved)?.id ?? agents[0]?.id ?? null
		);
	}, [agents]);
}
