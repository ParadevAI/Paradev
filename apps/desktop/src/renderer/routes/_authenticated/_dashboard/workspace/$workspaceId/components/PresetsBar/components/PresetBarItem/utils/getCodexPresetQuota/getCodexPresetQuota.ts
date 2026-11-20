import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";

const MAX_QUOTA_AGE_MS = 10 * 60_000;

export function getCodexPresetQuota(
	accounts: readonly UsageAccount[],
	now: number,
	failed: boolean,
) {
	const account = accounts.find(
		(candidate) => candidate.agent === "codex" && candidate.isDefault,
	);
	const windows =
		!failed &&
		account?.credentialKind === "subscription" &&
		account.status === "ok" &&
		now - new Date(account.fetchedAt).getTime() < MAX_QUOTA_AGE_MS
			? account.windows.filter(
					(window) =>
						Number.isFinite(window.usedPercent) &&
						window.usedPercent >= 0 &&
						(!window.resetsAt || new Date(window.resetsAt).getTime() > now),
				)
			: [];
	const summary =
		windows.find(
			(window) => window.id === "seven_day" || window.label === "Weekly",
		) ??
		windows.find((window) => window.id === "secondary") ??
		windows[0];
	return { account, windows, summary };
}
