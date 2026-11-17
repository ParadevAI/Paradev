import { V2AgentsSettings } from "../V2AgentsSettings";

interface AgentsSettingsPageProps {
	initialAgentId?: string | null;
}

export function AgentsSettingsPage({
	initialAgentId = null,
}: AgentsSettingsPageProps) {
	return <V2AgentsSettings initialAgentId={initialAgentId} />;
}
