import { parseAgentCliMissing } from "@superset/host-service/acp-catalogue";
import {
	type CodingAgentId,
	isCodingAgentId,
} from "renderer/routes/_authenticated/components/CodingAgentSetup";

/**
 * The agent to offer an install for: only Claude Code or Codex, and only when
 * the chat runs on this machine, where the app can install it.
 */
export function missingCodingAgent(
	detail: string | null | undefined,
	hosts: {
		hostUrl: string | null | undefined;
		localHostUrl: string | null | undefined;
	},
): CodingAgentId | null {
	if (!hosts.localHostUrl || hosts.hostUrl !== hosts.localHostUrl) return null;
	const missing = parseAgentCliMissing(detail);
	return isCodingAgentId(missing) ? missing : null;
}
