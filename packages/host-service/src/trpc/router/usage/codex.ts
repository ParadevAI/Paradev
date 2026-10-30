/**
 * Codex subscription quota from the ChatGPT backend `wham/usage` endpoint,
 * using the OAuth token the Codex CLI already stores in `$CODEX_HOME/auth.json`.
 * Read-only: we never refresh the token (see claude.ts for why). A lapsed
 * access token is reported as `token_stale` while a refresh token remains.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type CodexHome,
	discoverCodexHomes,
	SIGNED_OUT_PROFILE_DETAIL,
} from "./profiles";
import type {
	UsageAccount,
	UsageAccountStatus,
	UsageQuotaWindow,
} from "./types";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const FETCH_TIMEOUT_MS = 10_000;

interface CodexTokens {
	access_token?: string;
	refresh_token?: string;
	account_id?: string;
}

interface CodexAuthFile {
	tokens?: CodexTokens | null;
}

interface CodexRateLimitWindow {
	used_percent?: number;
	limit_window_seconds?: number;
	reset_at?: number;
	reset_after_seconds?: number;
}

interface CodexRateLimit {
	primary_window?: CodexRateLimitWindow | null;
	secondary_window?: CodexRateLimitWindow | null;
}

interface CodexUsageResponse {
	email?: string;
	plan_type?: string;
	rate_limit?: CodexRateLimit;
	additional_rate_limits?: Array<{
		limit_name?: string;
		rate_limit?: CodexRateLimit;
	}>;
	credits?: { balance?: string };
}

function windowLabel(limitWindowSeconds: number | undefined): string {
	if (limitWindowSeconds === undefined) return "Limit";
	const hours = Math.round(limitWindowSeconds / 3600);
	if (hours <= 5) return `Session (${hours}h)`;
	if (hours === 168) return "Weekly";
	if (hours % 24 === 0) return `${hours / 24}d`;
	return `${hours}h`;
}

function toWindow(
	id: string,
	labelPrefix: string,
	window: CodexRateLimitWindow | null | undefined,
): UsageQuotaWindow | null {
	if (!window || typeof window.used_percent !== "number") return null;
	const label = labelPrefix
		? `${windowLabel(window.limit_window_seconds)} · ${labelPrefix}`
		: windowLabel(window.limit_window_seconds);
	const resetsAt =
		typeof window.reset_at === "number"
			? new Date(window.reset_at * 1000)
			: typeof window.reset_after_seconds === "number"
				? new Date(Date.now() + window.reset_after_seconds * 1000)
				: null;
	return {
		id,
		label,
		usedPercent: Math.max(0, Math.round(window.used_percent)),
		resetsAt,
	};
}

function mapWindows(usage: CodexUsageResponse): UsageQuotaWindow[] {
	const windows: UsageQuotaWindow[] = [];
	const primary = toWindow("primary", "", usage.rate_limit?.primary_window);
	if (primary) windows.push(primary);
	const secondary = toWindow(
		"secondary",
		"",
		usage.rate_limit?.secondary_window,
	);
	if (secondary) windows.push(secondary);

	for (const [index, extra] of (usage.additional_rate_limits ?? []).entries()) {
		const name = extra.limit_name ?? `limit_${index}`;
		const window = toWindow(
			`additional:${name}`,
			name,
			extra.rate_limit?.primary_window,
		);
		if (window) windows.push(window);
	}
	return windows;
}

/** `homeDir` overrides the home dir for tests. */
export async function fetchCodexAccounts(
	homeDir?: string,
): Promise<UsageAccount[]> {
	const homes = await discoverCodexHomes(homeDir);
	// The first discovered home is what codex uses with no CODEX_HOME override
	// (see discoverCodexHomes) — running on it needs no env injection.
	const defaultHome = homes[0]?.home ?? null;
	const accounts = await Promise.all(
		homes.map((home) =>
			fetchCodexAccountForHome(home, home.home === defaultHome),
		),
	);
	return dedupeCodexAccounts(accounts.flat());
}

export interface CodexHomeAccount {
	account: UsageAccount;
	chatgptAccountId: string | null;
}

export function dedupeCodexAccounts(
	accounts: CodexHomeAccount[],
): UsageAccount[] {
	const seen = new Set<string>();
	return accounts
		.filter(({ account, chatgptAccountId }) => {
			// One email can hold several ChatGPT accounts: a personal plan and workspace seats.
			const key =
				account.email && chatgptAccountId
					? JSON.stringify([account.email, chatgptAccountId])
					: account.accountKey;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.map(({ account }) => account);
}

/** What the ChatGPT usage endpoint says about one access token. */
export interface CodexSubscriptionQuota {
	email: string | null;
	plan: string | null;
	status: UsageAccountStatus;
	statusDetail: string | null;
	windows: UsageQuotaWindow[];
	creditsBalance: number | null;
}

export const CODEX_STALE_TOKEN_DETAIL = "Refreshes when Codex next runs.";
export const CODEX_EXPIRED_TOKEN_DETAIL =
	"Sign-in expired — run `codex login`.";

/** The `exp` claim of a JWT access token in ms, or null when it is unreadable. */
function accessTokenExpiresAt(accessToken: string): number | null {
	try {
		const payload = accessToken.split(".")[1] ?? "";
		const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
		return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
	} catch {
		return null;
	}
}

/**
 * Codex renews a lapsed access token from its refresh token the next time it
 * runs, so only a lapsed token without a refresh token means the login is
 * gone. A token whose expiry cannot be read is left to the usage endpoint.
 */
export function classifyCodexToken(
	tokens: CodexTokens,
	now = Date.now(),
): "live" | "token_stale" | "token_expired" {
	const expiresAt = tokens.access_token
		? accessTokenExpiresAt(tokens.access_token)
		: null;
	if (expiresAt === null || expiresAt > now) return "live";
	return tokens.refresh_token ? "token_stale" : "token_expired";
}

/**
 * Reads the subscription quota behind a ChatGPT OAuth access token. The
 * OpenCode reader shares this: its OpenAI login is the same OAuth client.
 */
export async function fetchCodexSubscriptionQuota(
	accessToken: string,
	accountId?: string,
): Promise<CodexSubscriptionQuota> {
	const empty = { email: null, plan: null, windows: [], creditsBalance: null };
	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
		};
		if (accountId) headers["chatgpt-account-id"] = accountId;
		const response = await fetch(CODEX_USAGE_URL, {
			headers,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		// A 403 is a refusal that a new sign-in does not clear.
		if (response.status === 401) {
			return {
				...empty,
				status: "token_expired",
				statusDetail: CODEX_EXPIRED_TOKEN_DETAIL,
			};
		}
		if (!response.ok) {
			return {
				...empty,
				status: "unavailable",
				statusDetail: `Usage endpoint returned ${response.status}.`,
			};
		}

		const usage = (await response.json()) as CodexUsageResponse;
		const windows = mapWindows(usage);
		const balance = Number.parseFloat(usage.credits?.balance ?? "");
		return {
			email: usage.email ?? null,
			plan: usage.plan_type ?? null,
			status: windows.length > 0 ? "ok" : "unavailable",
			statusDetail:
				windows.length > 0 ? null : "No quota data returned for this plan.",
			windows,
			creditsBalance: Number.isFinite(balance) ? balance : null,
		};
	} catch (error) {
		return {
			...empty,
			status: "unavailable",
			statusDetail:
				error instanceof Error ? error.message : "Failed to fetch usage.",
		};
	}
}

async function fetchCodexAccountForHome(
	home: CodexHome,
	isDefaultHome: boolean,
): Promise<CodexHomeAccount[]> {
	const codexHome = home.home;
	const authPath = join(codexHome, "auth.json");
	const base = {
		agent: "codex" as const,
		credentialKind: home.credentialKind,
		accountKey: authPath,
		sourceLabel: codexHome.replace(homedir(), "~"),
		extraUsage: null,
		selection: isDefaultHome ? null : codexHome,
		// Decorated per-query from host settings; the quota cache outlives it.
		isDefault: false,
		fetchedAt: new Date(),
	};

	// API billing has no quota endpoint, and the auth.json holds the raw key —
	// the card is built from the marker alone.
	if (home.credentialKind === "api_key") {
		return [
			{
				account: {
					...base,
					email: null,
					plan: null,
					status: "ok",
					statusDetail:
						"Billed per token through the OpenAI Platform — no quota windows.",
					windows: [],
					creditsBalance: null,
				},
				chatgptAccountId: null,
			},
		];
	}

	let auth: CodexAuthFile | null = null;
	try {
		auth = JSON.parse(await readFile(authPath, "utf-8"));
	} catch {
		// No readable login; only a signed-out home still gets a card.
	}
	const tokens = auth?.tokens;
	const accessToken = tokens?.access_token;
	if (!tokens || !accessToken) {
		if (!home.signedOut) return [];
		return [
			{
				account: {
					...base,
					email: null,
					plan: null,
					status: "signed_out",
					statusDetail: SIGNED_OUT_PROFILE_DETAIL,
					windows: [],
					creditsBalance: null,
				},
				chatgptAccountId: null,
			},
		];
	}

	const lapsed = classifyCodexToken(tokens);
	if (lapsed !== "live") {
		return [
			{
				account: {
					...base,
					email: null,
					plan: null,
					status: lapsed,
					statusDetail:
						lapsed === "token_stale"
							? CODEX_STALE_TOKEN_DETAIL
							: CODEX_EXPIRED_TOKEN_DETAIL,
					windows: [],
					creditsBalance: null,
				},
				chatgptAccountId: tokens.account_id ?? null,
			},
		];
	}

	const quota = await fetchCodexSubscriptionQuota(
		accessToken,
		tokens.account_id,
	);
	return [
		{
			account: { ...base, ...quota },
			chatgptAccountId: tokens.account_id ?? null,
		},
	];
}
