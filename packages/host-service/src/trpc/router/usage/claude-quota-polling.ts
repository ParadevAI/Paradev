export const CLAUDE_ACTIVE_QUOTA_POLL_MS = 2 * 60_000;
export const CLAUDE_IDLE_QUOTA_POLL_MS = 10 * 60_000;
const RECENT_ACTIVITY_MS = 5 * 60_000;

interface ClaudeQuotaActivity {
	agentId: string;
	agentSessionId?: string;
	confirmedSessionId?: string;
	endedAt?: number;
	failureType?: string;
	lastEventAt: number;
	accountInvalid?: boolean;
	account?: {
		conflict?: boolean;
		agent: string;
		credentialKind: string;
		selection: string | null;
		identity: string;
	};
}

/** Activity changes scheduling only; it never establishes quota or account authority. */
export function createClaudeQuotaPolling(now = Date.now) {
	const sources = new Map<symbol, () => readonly ClaudeQuotaActivity[]>();
	return {
		register(source: () => readonly ClaudeQuotaActivity[]) {
			if (sources.size >= 32)
				throw new Error("Too many usage activity owners.");
			const owner = Symbol();
			sources.set(owner, source);
			return () => {
				sources.delete(owner);
			};
		},
		interval(selection: string | null): number {
			const at = now();
			for (const source of sources.values()) {
				try {
					if (
						source().some(
							(binding) =>
								binding.agentId === "claude" &&
								binding.endedAt === undefined &&
								!!binding.agentSessionId &&
								(binding.confirmedSessionId === undefined ||
									binding.agentSessionId === binding.confirmedSessionId) &&
								binding.failureType !== "session_identity_conflict" &&
								!binding.accountInvalid &&
								!binding.account?.conflict &&
								binding.account?.agent === "claude" &&
								binding.account.credentialKind === "subscription" &&
								!!binding.account.identity &&
								binding.account.selection === selection &&
								Number.isFinite(binding.lastEventAt) &&
								binding.lastEventAt <= at &&
								at - binding.lastEventAt < RECENT_ACTIVITY_MS,
						)
					)
						return CLAUDE_ACTIVE_QUOTA_POLL_MS;
				} catch {
					// An unavailable activity source cannot change identity or force a request.
				}
			}
			return CLAUDE_IDLE_QUOTA_POLL_MS;
		},
	};
}

export const claudeQuotaPolling = createClaudeQuotaPolling();
