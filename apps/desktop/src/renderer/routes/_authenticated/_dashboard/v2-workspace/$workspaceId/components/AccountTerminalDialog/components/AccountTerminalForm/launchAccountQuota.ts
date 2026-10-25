export interface LaunchAccount {
	selection: string | null;
	identity: string;
	email: string;
	label: string;
}

export interface LaunchQuotaWindow {
	id: string;
	label: string;
	usedPercent: number;
	resetsAt: Date | string | null;
	observedAt?: Date | string;
	windowSeconds?: number | null;
	source?: string;
}

/** Optional existing quota response. No private account registry is required. */
export interface LaunchQuota {
	agent: string;
	selection: string | null;
	email: string | null;
	credentialKind: string;
	status: string;
	fetchedAt: Date | string;
	isDefault?: boolean;
	identityChanged?: boolean;
	windows: LaunchQuotaWindow[];
}

const MAX_QUOTA_AGE_MS = 6 * 60_000;

export function accountKey(account: Pick<LaunchAccount, "selection" | "identity">) {
	return JSON.stringify([account.selection, account.identity]);
}

function fresh(value: Date | string, now: number): boolean {
	const age = now - new Date(value).getTime();
	return Number.isFinite(age) && age >= 0 && age <= MAX_QUOTA_AGE_MS;
}

function basicWindow(window: LaunchQuotaWindow) {
	return (
		["five_hour", "session", "seven_day", "weekly"].includes(window.id) ||
		(["primary", "secondary"].includes(window.id) &&
			typeof window.windowSeconds === "number" &&
			(window.windowSeconds === 604800 ||
				(window.windowSeconds > 0 && window.windowSeconds <= 18000)))
	);
}

/** Never join a quota row by email alone or carry a stale login's reading forward. */
export function launchAccountQuota(
	account: LaunchAccount,
	provider: string,
	quotas: readonly LaunchQuota[],
	now = Date.now(),
) {
	const matches = quotas.filter(
		(quota) =>
			quota.agent === provider &&
			quota.selection === account.selection &&
			quota.email === account.email,
	);
	const quota = matches.length === 1 ? matches[0] : undefined;
	if (
		!quota ||
		quota.credentialKind !== "subscription" ||
		quota.status !== "ok" ||
		quota.identityChanged ||
		!fresh(quota.fetchedAt, now)
	)
		return undefined;
	const windows = quota.windows.filter(basicWindow);
	if (
		!windows.length ||
		windows.some((window) => {
			const reset = window.resetsAt
				? new Date(window.resetsAt).getTime()
				: null;
			return (
				!Number.isFinite(window.usedPercent) ||
				window.usedPercent < 0 ||
				window.usedPercent > 100 ||
				!fresh(window.observedAt ?? quota.fetchedAt, now) ||
				(reset !== null && (!Number.isFinite(reset) || reset <= now))
			);
		})
	)
		return undefined;
	return {
		windows,
		remaining: Math.min(...windows.map((window) => 100 - window.usedPercent)),
		isDefault: quota.isDefault === true,
		// A partial passive Claude observation cannot prove unknown weekly quota.
		recommendable:
			windows.length >= 2 ||
			!windows.some((window) => window.source?.startsWith("claude_")),
	};
}

export function bestRemainingAccount(
	accounts: readonly LaunchAccount[],
	provider: string,
	quotas: readonly LaunchQuota[],
	now = Date.now(),
): LaunchAccount | undefined {
	let best:
		| { account: LaunchAccount; remaining: number; isDefault: boolean }
		| undefined;
	for (const account of accounts) {
		const quota = launchAccountQuota(account, provider, quotas, now);
		if (!quota || !quota.recommendable || quota.remaining <= 0) continue;
		if (
			!best ||
			quota.remaining > best.remaining ||
			(quota.remaining === best.remaining && quota.isDefault && !best.isDefault)
		)
			best = { account, remaining: quota.remaining, isDefault: quota.isDefault };
	}
	return best?.account;
}
