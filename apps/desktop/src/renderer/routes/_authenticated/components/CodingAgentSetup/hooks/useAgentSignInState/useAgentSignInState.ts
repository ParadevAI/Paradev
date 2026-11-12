import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { useHostUsageLogins } from "renderer/routes/_authenticated/settings/usage/hooks/useHostUsageLogins";
import type { CodingAgentId } from "../../constants";
import {
	type AgentSignInState,
	agentSignInState,
} from "../../utils/agentSignInState";

export function useAgentSignInState(
	agent: CodingAgentId,
	enabled: boolean,
): AgentSignInState {
	const { activeHostUrl } = useLocalHostService();
	const logins = useHostUsageLogins(activeHostUrl, enabled, { poll: false });
	return agentSignInState(agent, logins.data);
}
