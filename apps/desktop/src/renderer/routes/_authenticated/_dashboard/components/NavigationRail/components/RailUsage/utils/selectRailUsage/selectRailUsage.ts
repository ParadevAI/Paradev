import type {
	UsageAccount,
	UsageQuotaWindow,
} from "renderer/hooks/host-service/useHostUsageQuota";
import { isModelScopedWindow } from "../isModelScopedWindow";

const RAIL_AGENT_ORDER: UsageAccount["agent"][] = [
	"claude",
	"codex",
	"grok",
	"agy",
	"opencode",
];

export const MAX_RAIL_USAGE_ACCOUNTS = 2;
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
): RailUsageEntry[] {
	return RAIL_AGENT_ORDER.flatMap((agent) => {
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
	}).slice(0, MAX_RAIL_USAGE_ACCOUNTS);
}
