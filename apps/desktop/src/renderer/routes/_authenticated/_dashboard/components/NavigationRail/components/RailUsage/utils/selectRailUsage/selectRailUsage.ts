import type {
	UsageAccount,
	UsageQuotaWindow,
} from "renderer/hooks/host-service/useHostUsageQuota";
import { QUOTA_AGENT_ORDER } from "renderer/utils/usage/quotaAgentLabels";
import { isModelScopedWindow } from "../isModelScopedWindow";

const MAX_RINGS_PER_ACCOUNT = 2;

export interface RailUsageEntry {
	account: UsageAccount;
	rings: UsageQuotaWindow[];
}

function ringWindows(windows: UsageQuotaWindow[]): UsageQuotaWindow[] {
	const accountWide = windows.filter(
		(window) =>
			Number.isFinite(window.usedPercent) && !isModelScopedWindow(window),
	);
	if (accountWide.length <= MAX_RINGS_PER_ACCOUNT) return accountWide;
	const tightest = new Set(
		[...accountWide]
			.sort((a, b) => b.usedPercent - a.usedPercent)
			.slice(0, MAX_RINGS_PER_ACCOUNT),
	);
	return accountWide.filter((window) => tightest.has(window));
}

export function selectRailUsage(
	accounts: ReadonlyArray<UsageAccount>,
	hiddenProviders: readonly UsageAccount["agent"][] = [],
): RailUsageEntry[] {
	return QUOTA_AGENT_ORDER.flatMap((agent) => {
		if (hiddenProviders.includes(agent)) return [];
		const readable = accounts.filter(
			(account) =>
				account.agent === agent &&
				account.credentialKind === "subscription" &&
				account.status === "ok",
		);
		const account =
			readable.find((candidate) => candidate.isDefault) ?? readable[0];
		if (!account) return [];
		const rings = ringWindows(account.windows);
		return rings.length > 0 ? [{ account, rings }] : [];
	});
}
