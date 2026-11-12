import type { UsageLogins } from "renderer/routes/_authenticated/settings/usage/hooks/useHostUsageLogins";
import type { CodingAgentId } from "../../constants";

export interface AgentSignInState {
	/** Null while the host has not answered. */
	signedIn: boolean | null;
	account: string | null;
}

/** The system-default login, as Settings → Usage reads it on the host. */
export function agentSignInState(
	agent: CodingAgentId,
	logins: UsageLogins | null | undefined,
): AgentSignInState {
	if (!logins) return { signedIn: null, account: null };
	if (agent === "claude") {
		return {
			signedIn: logins.claudeDefaultFingerprint !== null,
			account: logins.claudeDefaultEmail ?? null,
		};
	}
	return { signedIn: Boolean(logins.codex[0]?.fingerprint), account: null };
}
