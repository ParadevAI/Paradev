import {
	type CodingAgentId,
	isCodingAgentId,
} from "renderer/routes/_authenticated/components/CodingAgentSetup";

/**
 * The agent to offer an install for: Claude Code or Codex, on a chat that
 * failed, when the app's lookup finds no binary new enough for chat (the same
 * resolver and minimum version host-service checks). Only for a chat on this
 * machine, where the app can install it.
 */
export function missingCodingAgent({
	agentId,
	failed,
	usable,
	hostUrl,
	localHostUrl,
}: {
	agentId: string | undefined;
	failed: boolean;
	/** Installed and new enough for chat; undefined until the lookup answers. */
	usable: boolean | undefined;
	hostUrl: string | null | undefined;
	localHostUrl: string | null | undefined;
}): CodingAgentId | null {
	if (!failed || usable !== false) return null;
	if (!localHostUrl || hostUrl !== localHostUrl) return null;
	return isCodingAgentId(agentId) ? agentId : null;
}
