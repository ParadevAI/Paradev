import {
	type CodingAgentId,
	isCodingAgentId,
} from "renderer/routes/_authenticated/components/CodingAgentSetup";

/**
 * The agent to offer an install for: Claude Code or Codex, on a chat that
 * failed, when the app's own lookup of the binary found none. Only for a chat
 * on this machine, where the app can install it.
 */
export function missingCodingAgent({
	agentId,
	failed,
	installed,
	hostUrl,
	localHostUrl,
}: {
	agentId: string | undefined;
	failed: boolean;
	/** From the app's lookup; undefined until it answers. */
	installed: boolean | undefined;
	hostUrl: string | null | undefined;
	localHostUrl: string | null | undefined;
}): CodingAgentId | null {
	if (!failed || installed !== false) return null;
	if (!localHostUrl || hostUrl !== localHostUrl) return null;
	return isCodingAgentId(agentId) ? agentId : null;
}
