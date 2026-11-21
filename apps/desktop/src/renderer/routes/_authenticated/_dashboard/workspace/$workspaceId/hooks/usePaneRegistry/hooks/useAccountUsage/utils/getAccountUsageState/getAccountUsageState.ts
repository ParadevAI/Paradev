import type {
	UsageAccount,
	UsageQuotaWindow,
} from "renderer/hooks/host-service/useHostUsageQuota";

interface Identity {
	source?: "environment" | "profile";
	email?: string;
	agent: "claude" | "codex";
	selection: string | null;
	credentialKind: "subscription" | "api_key";
}
export function getAccountUsageState({
	supported,
	identity,
	accounts,
	loading,
	failed,
	now,
}: {
	supported: boolean;
	identity: Identity | null | undefined;
	accounts: UsageAccount[];
	loading: boolean;
	failed: boolean;
	now: number;
}) {
	const account =
		identity && identity.source !== "environment"
			? accounts.find(
					(a) =>
						a.agent === identity.agent &&
						a.selection === identity.selection &&
						a.credentialKind === identity.credentialKind &&
						(identity.credentialKind === "api_key" ||
							a.email === identity.email),
				)
			: undefined;
	const windows =
		account?.windows.filter(
			(w) => Number.isFinite(w.usedPercent) && w.usedPercent >= 0,
		) ?? [];
	const generalWindows = windows.filter((w) =>
		["five_hour", "seven_day", "primary", "secondary"].includes(w.id),
	);
	const hasReset = (window: UsageQuotaWindow) =>
		window.resetsAt !== null && new Date(window.resetsAt).getTime() <= now;
	const isCodex = identity?.agent === "codex";
	const usableWindows = isCodex
		? generalWindows.filter((window) => !hasReset(window))
		: generalWindows;
	const tightest = usableWindows.reduce<UsageQuotaWindow | undefined>(
		(a, b) => (!a || b.usedPercent > a.usedPercent ? b : a),
		undefined,
	);
	const stale =
		account &&
		(failed ||
			now - new Date(account.fetchedAt).getTime() >= 10 * 60_000 ||
			(isCodex ? !tightest : windows.some(hasReset)));
	const state = !supported
		? "unavailable"
		: loading
			? "loading"
			: !identity
				? "unverified"
				: identity.credentialKind === "api_key"
					? "api"
					: !account || account.status !== "ok" || generalWindows.length === 0
						? "unavailable"
						: stale
							? "stale"
							: "ready";
	return { account, tightest, state };
}
