/**
 * Codex subscription quota from the ChatGPT backend `wham/usage` endpoint,
 * using the OAuth token the Codex CLI already stores in `$CODEX_HOME/auth.json`.
 * Read-only: we never refresh the token (see claude.ts for why).
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { assertCodexFileCredentialStore } from "./codex-quota-config";
import { createCredentialQuotaCache } from "./credential-quota-cache";
import { type CodexHome, discoverCodexHomes } from "./profiles";
import { copyQuotaRetry, recordQuotaRetry } from "./quota-backoff";
import type { QuotaSnapshot } from "./quota-cache";
import {
	parseQuotaCredentialJson,
	QuotaCredentialReadError,
	readQuotaCredentialFile,
	unavailableQuotaAccount,
} from "./quota-credentials";
import {
	createQuotaRequestBudget,
	QUOTA_REQUEST_BUDGET_MS,
} from "./quota-request";
import {
	opaqueQuotaIdentity,
	type QuotaFetch,
	quotaRateLimits,
	resetMetadata,
} from "./quota-widget-metadata";
import { parseCodexResetCredits } from "./reset-credits";
import type {
	UsageAccount,
	UsageAccountStatus,
	UsageQuotaWindow,
} from "./types";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

interface CodexAuthFile {
	tokens?: {
		access_token?: string;
		account_id?: string;
	};
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
	account_id?: string;
	accountId?: string;
	rate_limit_reset_credits?: { available_count?: number } | null;
	email?: string;
	plan_type?: string;
	rate_limit?: CodexRateLimit;
	additional_rate_limits?: Array<{
		limit_name?: string;
		rate_limit?: CodexRateLimit;
	}>;
	credits?: { balance?: string };
}

function windowLabel(limitWindowSeconds: number | null | undefined): string {
	if (
		typeof limitWindowSeconds !== "number" ||
		!Number.isFinite(limitWindowSeconds) ||
		limitWindowSeconds <= 0
	)
		return "Limit";
	const hours = Math.round(limitWindowSeconds / 3600);
	if (limitWindowSeconds <= 18_000) return `Session (${hours}h)`;
	if (limitWindowSeconds === 604_800) return "Weekly";
	if (hours % 24 === 0) return `${hours / 24}d`;
	return `${hours}h`;
}

function toWindow(
	id: string,
	labelPrefix: string,
	window: CodexRateLimitWindow | null | undefined,
): UsageQuotaWindow | null {
	if (
		!window ||
		typeof window.used_percent !== "number" ||
		!Number.isFinite(window.used_percent)
	)
		return null;
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
		...(typeof window.limit_window_seconds === "number" &&
		Number.isFinite(window.limit_window_seconds) &&
		window.limit_window_seconds > 0
			? { windowSeconds: window.limit_window_seconds }
			: {}),
	};
}

export function mapCodexQuotaWindows(
	usage: CodexUsageResponse,
): UsageQuotaWindow[] {
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

export async function fetchCodexAccounts(): Promise<UsageAccount[]> {
	const homes = await discoverCodexHomes();
	// The first discovered home is what codex uses with no CODEX_HOME override
	// (see discoverCodexHomes) — running on it needs no env injection.
	const defaultHome = homes[0]?.home ?? null;
	const accounts = await Promise.all(
		homes.map((home) =>
			fetchCodexAccountForHome(home, home.home === defaultHome),
		),
	);
	// Keep profile identities separate; transport requests are deduplicated below.
	return accounts.flat();
}

export async function captureCodexQuotaSnapshot(
	captureHomes = () => discoverCodexHomes({ includeUnavailable: true }),
	fetchQuota = fetchCodexSubscriptionQuota,
): Promise<QuotaSnapshot<UsageAccount[]>> {
	let homes: CodexHome[];
	try {
		homes = structuredClone(await captureHomes());
	} catch {
		return {
			revision: "codex:discovery-unavailable",
			load: async () => [
				unavailableQuotaAccount({
					agent: "codex",
					accountKey: "codex:discovery",
					sourceLabel: "Codex accounts",
					selection: null,
				}),
			],
		};
	}
	const inputs = await Promise.all(
		homes.map(async (home, index) => {
			const source = {
				agent: "codex" as const,
				accountKey: join(home.home, "auth.json"),
				sourceLabel: home.sourceLabel,
				selection: index === 0 ? null : home.home,
			};
			try {
				if (home.quotaUnavailable)
					return { state: "unavailable" as const, source };
				return {
					state: "available" as const,
					home,
					isDefaultHome: index === 0,
					source,
					auth:
						home.credentialKind === "api_key"
							? null
							: await readCodexQuotaAuth(home.home),
				};
			} catch {
				return { state: "unavailable" as const, source };
			}
		}),
	);
	const revision = createHash("sha256")
		.update(JSON.stringify(inputs))
		.digest("hex");
	return {
		revision,
		load: async (forceRefresh = false) =>
			(
				await Promise.all(
					inputs.map(async (input) => {
						if (input.state === "unavailable")
							return [unavailableQuotaAccount(input.source)];
						try {
							return await fetchCodexAccountForHome(
								input.home,
								input.isDefaultHome,
								input.auth,
								fetchQuota,
								forceRefresh,
							);
						} catch {
							return [unavailableQuotaAccount(input.source)];
						}
					}),
				)
			).flat(),
	};
}

async function readCodexQuotaAuth(home: string): Promise<CodexAuthFile | null> {
	await assertCodexFileCredentialStore(home);
	const raw = await readQuotaCredentialFile(join(home, "auth.json"));
	if (raw === null) return null;
	const parsed = parseQuotaCredentialJson(raw);
	if (parsed.auth_mode !== undefined && parsed.auth_mode !== "chatgpt")
		throw new QuotaCredentialReadError();
	if (parsed.tokens === undefined || parsed.tokens === null) return null;
	if (typeof parsed.tokens !== "object" || Array.isArray(parsed.tokens))
		throw new QuotaCredentialReadError();
	const tokens = parsed.tokens as Record<string, unknown>;
	if (
		typeof tokens.access_token !== "string" ||
		!tokens.access_token.trim() ||
		(tokens.account_id != null && typeof tokens.account_id !== "string")
	)
		throw new QuotaCredentialReadError();
	return {
		tokens: {
			access_token: tokens.access_token,
			account_id: (tokens.account_id ?? undefined) as string | undefined,
		},
	};
}

/** What the ChatGPT usage endpoint says about one access token. */
export interface CodexSubscriptionQuota {
	email: string | null;
	plan: string | null;
	status: UsageAccountStatus;
	statusDetail: string | null;
	windows: UsageQuotaWindow[];
	creditsBalance: number | null;
	quotaIdentity?: string;
	resetCredits?: UsageAccount["resetCredits"];
}

export const CODEX_EXPIRED_TOKEN_DETAIL =
	"Codex token expired — run `codex` to refresh it.";

/**
 * Reads the subscription quota behind a ChatGPT OAuth access token. The
 * OpenCode reader shares this: its OpenAI login is the same OAuth client.
 */
export async function fetchCodexSubscriptionQuota(
	accessToken: string,
	accountId?: string,
	budgetOrFetcher: number | QuotaFetch = QUOTA_REQUEST_BUDGET_MS,
	budget = createQuotaRequestBudget(
		typeof budgetOrFetcher === "number"
			? budgetOrFetcher
			: QUOTA_REQUEST_BUDGET_MS,
	),
	readResets = (token: string, id: string, signal: AbortSignal) =>
		resetMetadata.codex(token, id, signal),
	rateLimits = quotaRateLimits,
): Promise<CodexSubscriptionQuota> {
	const fetcher =
		typeof budgetOrFetcher === "number" ? globalThis.fetch : budgetOrFetcher;
	const empty = { email: null, plan: null, windows: [], creditsBalance: null };
	const scope = opaqueQuotaIdentity(
		"codex-quota",
		accessToken,
		accountId ?? "",
	);
	if (rateLimits.blocked(scope))
		return {
			...empty,
			status: "unavailable",
			statusDetail: "Usage endpoint rate limited. Try again later.",
		};
	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
		};
		if (accountId) headers["chatgpt-account-id"] = accountId;
		const response = await budget.run(async (signal) => {
			const response = await fetcher(CODEX_USAGE_URL, {
				headers,
				signal,
				cache: "no-store",
				redirect: "error",
			});
			rateLimits.record(scope, response);
			return {
				original: response,
				status: response.status,
				ok: response.ok,
				body: response.ok ? ((await response.json()) as unknown) : null,
			};
		});

		if (response.status === 401 || response.status === 403) {
			return {
				...empty,
				status: "token_expired",
				statusDetail: CODEX_EXPIRED_TOKEN_DETAIL,
			};
		}
		if (!response.ok) {
			return recordQuotaRetry(
				{
					...empty,
					status: "unavailable",
					statusDetail: `Usage endpoint returned ${response.status}.`,
				},
				response.original,
			);
		}

		const usage = response.body as CodexUsageResponse;
		const windows = mapCodexQuotaWindows(usage);
		const balance = Number.parseFloat(usage.credits?.balance ?? "");
		const returnedId = usage.account_id ?? usage.accountId;
		if (accountId && returnedId && returnedId !== accountId)
			return {
				...empty,
				status: "unavailable",
				statusDetail: "Usage account does not match the selected sign-in.",
			};
		const owner = returnedId ?? usage.email;
		const observedAt = new Date();
		const summary = parseCodexResetCredits(
			usage.rate_limit_reset_credits,
			null,
			observedAt,
		);
		const details =
			accountId && windows.length && summary.availableCount !== 0
				? await budget
						.run((signal) => readResets(accessToken, accountId, signal), 2_000)
						.catch(() => undefined)
				: undefined;
		const resetCredits =
			summary.availableCount === null
				? details
				: {
						...summary,
						expirations:
							details?.availableCount === summary.availableCount &&
							details.checkedAt >= observedAt &&
							details.expirations?.length === summary.availableCount
								? details.expirations
								: null,
					};
		return {
			email: usage.email ?? null,
			plan: usage.plan_type ?? null,
			status: windows.length > 0 ? "ok" : "unavailable",
			statusDetail:
				windows.length > 0 ? null : "No quota data returned for this plan.",
			windows,
			creditsBalance: Number.isFinite(balance) ? balance : null,
			...(owner
				? {
						quotaIdentity: opaqueQuotaIdentity(
							"codex",
							"oauth",
							JSON.stringify([owner, accountId ?? null]),
						),
						resetCredits,
					}
				: {}),
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

const credentialQuotaCache = createCredentialQuotaCache<
	CodexSubscriptionQuota & { fetchedAt: Date }
>();
export function getCodexCredentialQuota(
	accessToken: string,
	accountId: string | undefined,
	sourceKey: string,
	forceRefresh = false,
	fetchQuota = fetchCodexSubscriptionQuota,
) {
	const key = createHash("sha256")
		.update(JSON.stringify([sourceKey, accessToken, accountId ?? null]))
		.digest("hex");
	const transportKey = createHash("sha256")
		.update(JSON.stringify(["codex", accessToken, accountId ?? null]))
		.digest("hex");
	return credentialQuotaCache.get(
		key,
		async () => {
			const quota = await fetchQuota(accessToken, accountId);
			return copyQuotaRetry(quota, { ...quota, fetchedAt: new Date() });
		},
		forceRefresh,
		transportKey,
	);
}

export async function fetchCodexAccountForHome(
	home: CodexHome,
	isDefaultHome: boolean,
	capturedAuth?:
		| CodexAuthFile
		| null
		| ((path: string) => Promise<string | null>),
	fetchQuota = fetchCodexSubscriptionQuota,
	forceRefresh = false,
): Promise<UsageAccount[]> {
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
				...base,
				email: null,
				plan: null,
				status: "ok",
				statusDetail:
					"Billed per token through the OpenAI Platform — no quota windows.",
				windows: [],
				creditsBalance: null,
			},
		];
	}

	const readCurrent = async (): Promise<CodexAuthFile | null> => {
		if (typeof capturedAuth === "function") {
			const raw = await capturedAuth(authPath);
			return raw === null
				? null
				: (parseQuotaCredentialJson(raw) as CodexAuthFile);
		}
		return readCodexQuotaAuth(codexHome);
	};
	let auth: CodexAuthFile;
	try {
		auth =
			capturedAuth === undefined || typeof capturedAuth === "function"
				? ((await readCurrent()) ?? {})
				: (capturedAuth ?? {});
	} catch {
		return [unavailableQuotaAccount({ ...base })];
	}

	const accessToken = auth.tokens?.access_token;
	if (!accessToken) return [];

	const quota = await getCodexCredentialQuota(
		accessToken,
		auth.tokens?.account_id,
		codexHome,
		forceRefresh,
		fetchQuota,
	);
	try {
		const current = await readCurrent();
		if (
			current?.tokens?.access_token !== accessToken ||
			current.tokens?.account_id !== auth.tokens?.account_id
		)
			return [
				{
					...base,
					email: null,
					plan: null,
					status: "unavailable",
					statusDetail: "Sign-in changed while reading usage.",
					windows: [],
					creditsBalance: null,
				},
			];
	} catch {
		return [unavailableQuotaAccount({ ...base })];
	}

	return [
		copyQuotaRetry(quota, {
			...base,
			...quota,
			...(quota.quotaIdentity
				? {
						quotaIdentity: opaqueQuotaIdentity(
							"codex",
							authPath,
							quota.quotaIdentity,
						),
					}
				: {}),
		}),
	];
}
