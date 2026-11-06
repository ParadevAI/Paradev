import { useAgentPreview } from "../../../../../../hooks/useAgentPreview";

/** What the agent is saying now, under its newest event. */
export function AgentSaid({ workspaceId }: { workspaceId: string }) {
	const { line } = useAgentPreview(workspaceId);
	return line;
}
