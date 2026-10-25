import {
	claudeLastKnown,
	type createClaudeLastKnownStore,
} from "./claude-last-known";
import { createClaudePrepaidReader } from "./claude-prepaid";
import { claudeProofStore, createClaudeProofStore } from "./claude-proof-store";
import {
	claudeRequests,
	type createClaudeRequestClient,
} from "./claude-request";
import { createClaudeResetEnvelope } from "./claude-reset-envelope";
import { createCredentialQuotaCache } from "./credential-quota-cache";
import { readQuotaRetryHint, recordQuotaRetry } from "./quota-backoff";
import { hashQuotaScope } from "./quota-cooldown-store";
import {
	bindClaudeQuotaIdentity,
	claudeProfileIdentity,
	restoreClaudeQuotaIdentity,
} from "./quota-identity";
import {
	createQuotaRequestBudget,
	OPTIONAL_QUOTA_BUDGET_MS,
} from "./quota-request";
import type {
	UsageAccount,
	UsageAccountStatus,
	UsageQuotaWindow,
} from "./types";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
const BETA = "oauth-2025-04-20";
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504, 529]);
const PROFILE_MAX_AGE_MS = 6 * 60 * 60_000;

function validDate(value: unknown): Date | null {
	if (typeof value !== "string") return null;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

interface ClaudeUsageWindow {
	utilization?: number;
	resets_at?: string;
}

interface ClaudeUsageResponse {
	five_hour?: ClaudeUsageWindow;
	seven_day?: ClaudeUsageWindow;
	seven_day_sonnet?: ClaudeUsageWindow;
	limits?: Array<{
		kind?: string;
		percent?: number;
		resets_at?: string;
		scope?: { model?: { display_name?: string } };
	}>;
	extra_usage?: { monthly_limit?: number; used_credits?: number };
}

interface ClaudeProfileResponse {
	account?: {
		uuid?: string;
		email?: string;
		email_address?: string;
		emailAddress?: string;
	};
	organization?: { uuid?: string };
	accountUuid?: string;
	account_uuid?: string;
	organizationUuid?: string;
	organization_uuid?: string;
	email?: string;
}

function toWindow(
	id: string,
	label: string,
	window: ClaudeUsageWindow | undefined,
): UsageQuotaWindow | null {
	if (
		!window ||
		typeof window.utilization !== "number" ||
		!Number.isFinite(window.utilization)
	)
		return null;
	return {
		id,
		label,
		usedPercent: Math.max(0, Math.min(100, Math.round(window.utilization))),
		resetsAt: validDate(window.resets_at),
	};
}

function mapWindows(usage: ClaudeUsageResponse): UsageQuotaWindow[] {
	const windows: UsageQuotaWindow[] = [];
	const session = toWindow("five_hour", "Session (5h)", usage.five_hour);
	if (session) windows.push(session);
	const weekly = toWindow("seven_day", "Weekly", usage.seven_day);
	if (weekly) windows.push(weekly);
	const sonnet = toWindow(
		"seven_day_sonnet",
		"Weekly · Sonnet",
		usage.seven_day_sonnet,
	);
	if (sonnet) windows.push(sonnet);

	for (const limit of Array.isArray(usage.limits) ? usage.limits : []) {
		if (!limit || typeof limit !== "object") continue;
		if (
			limit.kind !== "weekly_scoped" ||
			typeof limit.percent !== "number" ||
			!Number.isFinite(limit.percent)
		) {
			continue;
		}
		const modelName = limit.scope?.model?.display_name;
		if (
			typeof modelName !== "string" ||
			!modelName.trim() ||
			modelName.length > 200
		)
			continue;
		const label = `Weekly · ${modelName}`;
		if (windows.some((existing) => existing.label === label)) continue;
		windows.push({
			id: `weekly_scoped:${modelName}`,
			label,
			usedPercent: Math.max(0, Math.min(100, Math.round(limit.percent))),
			resetsAt: validDate(limit.resets_at),
		});
	}
	return windows;
}

export interface ClaudeSubscriptionQuota {
	email: string | null;
	status: UsageAccountStatus;
	statusDetail: string | null;
	windows: UsageQuotaWindow[];
	extraUsage: UsageAccount["extraUsage"];
	fetchedAt?: Date;
	retryAt?: Date;
	lastKnownUsage?: UsageAccount["lastKnownUsage"];
	prepaidBalance?: UsageAccount["prepaidBalance"];
	resetCredits?: UsageAccount["resetCredits"];
}

type Budgets = { primaryMs: number; profileMs: number };
type Context = { canonicalProfile?: string | null; signal?: AbortSignal };
type Request = ReturnType<typeof createClaudeRequestClient>["request"];

export function createClaudeSubscriptionReader({
	request = claudeRequests.request,
	now = () => Date.now(),
	history = claudeLastKnown,
	proofs = createClaudeProofStore(undefined, now),
}: {
	request?: Request;
	now?: () => number;
	history?: ReturnType<typeof createClaudeLastKnownStore>;
	proofs?: ReturnType<typeof createClaudeProofStore>;
} = {}) {
	const profiles = createCredentialQuotaCache<{
		profile: ClaudeProfileResponse | null;
		checkedAt: number;
	}>(
		(value) =>
			claudeProfileIdentity(value.profile) ? PROFILE_MAX_AGE_MS : 15 * 60_000,
		now,
	);
	const wallets = createClaudePrepaidReader({ request, now });
	const usageWithResets = createClaudeResetEnvelope(request, now);
	const pending = new Map<string, Promise<ClaudeSubscriptionQuota>>();
	function profileKey(token: string) {
		return hashQuotaScope(["claude-profile-cache-v1", token]);
	}
	function cachedProfile(token: string) {
		const value = profiles.peek(profileKey(token))?.value;
		return value &&
			value.checkedAt <= now() &&
			now() - value.checkedAt <= PROFILE_MAX_AGE_MS
			? value.profile
			: null;
	}
	async function fetchProfile(
		token: string,
		signal: AbortSignal,
		canonical?: string | null,
	) {
		const key = profileKey(token);
		await profiles.get(key, async () => {
			const previous = profiles.peek(key)?.value;
			const response = await request(
				"profile",
				token,
				PROFILE_URL,
				{
					cache: "no-store",
					redirect: "error",
					signal,
					headers: { Authorization: `Bearer ${token}`, "anthropic-beta": BETA },
				},
				canonical,
			);
			if (!response.ok) {
				if (!TRANSIENT.has(response.status)) proofs.forget(token);
				return recordQuotaRetry(
					{
						profile: TRANSIENT.has(response.status)
							? cachedProfile(token)
							: null,
						checkedAt: previous?.checkedAt ?? 0,
					},
					response,
				);
			}
			const body: unknown = await response.json();
			const profile =
				body && typeof body === "object" && !Array.isArray(body)
					? (body as ClaudeProfileResponse)
					: null;
			const checkedAt = now();
			if (claudeProfileIdentity(profile))
				proofs.remember(token, canonical ?? null, profile, checkedAt);
			else proofs.forget(token);
			return { profile, checkedAt };
		});
		return cachedProfile(token);
	}
	async function acquire(
		token: string,
		budgets: Budgets,
		context: Context,
	): Promise<ClaudeSubscriptionQuota> {
		let profile = cachedProfile(token);
		const budget = createQuotaRequestBudget(budgets.primaryMs, now);
		const result = async (
			quota: ClaudeSubscriptionQuota,
			response?: Response,
		) => {
			const measuredAt = quota.fetchedAt ?? new Date(now());
			const owner = profiles.peek(profileKey(token))?.value;
			const persisted = proofs.get(token, context.canonicalProfile ?? null);
			const bind = <T extends object>(value: T): T => {
				if (owner?.profile === profile && claudeProfileIdentity(profile))
					return bindClaudeQuotaIdentity(
						value,
						token,
						profile,
						owner.checkedAt,
					);
				return persisted && quota.status !== "token_expired"
					? restoreClaudeQuotaIdentity(value, persisted, now())
					: value;
			};
			const value = { ...quota, fetchedAt: measuredAt };
			if (response && TRANSIENT.has(response.status)) {
				const lastKnownUsage = profile
					? await history.get(token, profile)
					: persisted
						? await history.getVerifiedOwner(token, persisted.ownerHash)
						: undefined;
				const prepaidBalance = wallets.peek(token, profile);
				const withHistory = {
					...value,
					...(lastKnownUsage ? { lastKnownUsage } : {}),
					...(prepaidBalance ? { prepaidBalance } : {}),
				};
				recordQuotaRetry(withHistory, response);
				const retryAt = readQuotaRetryHint(withHistory)?.retryAt;
				if (retryAt) withHistory.retryAt = new Date(retryAt);
				return bind(withHistory);
			}
			return bind(value);
		};
		try {
			return await budget.run(async (budgetSignal) => {
				const signal = context.signal
					? AbortSignal.any([budgetSignal, context.signal])
					: budgetSignal;
				const { response, resetCredits } = await usageWithResets(
					token,
					USAGE_URL,
					{
						cache: "no-store",
						redirect: "error",
						signal,
						headers: {
							Authorization: `Bearer ${token}`,
							"anthropic-beta": BETA,
						},
					},
					context.canonicalProfile,
				);
				if (response.status === 401 || response.status === 403) {
					const persisted = proofs.get(token, context.canonicalProfile ?? null);
					await history.forget(token, profile);
					if (persisted)
						await history.forgetVerifiedOwner(token, persisted.ownerHash);
					proofs.forget(token);
					profiles.invalidate(profileKey(token));
					profile = null;
					return result({
						email: null,
						status: "token_expired",
						statusDetail: "Sign-in expired — run /login in Claude Code.",
						windows: [],
						extraUsage: null,
					});
				}
				let windows: UsageQuotaWindow[] = [];
				let extraUsage: UsageAccount["extraUsage"] = null;
				let observedAt = new Date(now());
				if (response.ok) {
					const usage = (await response.json()) as ClaudeUsageResponse;
					observedAt = new Date(now());
					windows = mapWindows(usage).map((window) => ({
						...window,
						observedAt,
						source: "provider" as const,
					}));
					const used = usage.extra_usage?.used_credits,
						limit = usage.extra_usage?.monthly_limit;
					if (
						typeof used === "number" &&
						Number.isFinite(used) &&
						used >= 0 &&
						typeof limit === "number" &&
						Number.isFinite(limit) &&
						limit >= 0
					)
						extraUsage = { usedCents: used, limitCents: limit };
				}
				let prepaidBalance: UsageAccount["prepaidBalance"];
				try {
					await budget.run(async (optionalSignal) => {
						const combined = AbortSignal.any([signal, optionalSignal]);
						profile = await fetchProfile(
							token,
							combined,
							context.canonicalProfile,
						);
						if (response.ok)
							prepaidBalance = await wallets.fetch(
								token,
								profile,
								combined,
								context.canonicalProfile,
							);
					}, budgets.profileMs);
				} catch {
					/* Optional identity/wallet latency cannot discard valid primary windows. */
				}
				const email =
					[
						profile?.account?.email,
						profile?.account?.email_address,
						profile?.account?.emailAddress,
						profile?.email,
					].find((value) => typeof value === "string" && value.trim()) ?? null;
				if (!response.ok)
					return result(
						{
							email,
							status: "unavailable",
							statusDetail: `Usage endpoint returned ${response.status}.`,
							windows: [],
							extraUsage: null,
						},
						response,
					);
				if (windows.length)
					await history.remember(token, profile, {
						windows,
						fetchedAt: observedAt,
					});
				else await history.forget(token, profile);
				return result({
					email,
					status: windows.length || prepaidBalance ? "ok" : "unavailable",
					statusDetail:
						windows.length || prepaidBalance
							? null
							: "No quota data returned (org-managed and education plans do not expose limits).",
					windows,
					extraUsage,
					fetchedAt: observedAt,
					...(prepaidBalance ? { prepaidBalance } : {}),
					...(resetCredits ? { resetCredits } : {}),
				});
			});
		} catch {
			return result(
				{
					email: null,
					status: "unavailable",
					statusDetail: "Usage request failed or timed out. Try again shortly.",
					windows: [],
					extraUsage: null,
				},
				new Response(null, { status: 503 }),
			);
		}
	}
	return {
		read(
			token: string,
			budgets: Budgets = {
				primaryMs: 8_000,
				profileMs: OPTIONAL_QUOTA_BUDGET_MS,
			},
			context: Context = {},
		) {
			const key = hashQuotaScope([
				"claude-acquire-v1",
				token,
				context.canonicalProfile ?? null,
			]);
			const current = pending.get(key);
			if (current) return current;
			if (pending.size >= 1024)
				return Promise.resolve<ClaudeSubscriptionQuota>({
					email: null,
					status: "unavailable",
					statusDetail: "Usage collector is busy. Try again shortly.",
					windows: [],
					extraUsage: null,
				});
			const operation = acquire(token, budgets, context).finally(() => {
				if (pending.get(key) === operation) pending.delete(key);
			});
			pending.set(key, operation);
			return operation;
		},
	};
}

const subscriptionReader = createClaudeSubscriptionReader({
	proofs: claudeProofStore,
});
export const fetchClaudeSubscriptionQuota = subscriptionReader.read;
