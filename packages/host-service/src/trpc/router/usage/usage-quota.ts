import { readQuotaRetry } from "./quota-backoff";
import { createQuotaCache, type QuotaSnapshot } from "./quota-cache";
import { unavailableQuotaAccount } from "./quota-credentials";
import type { UsageAccount } from "./types";

export const QUOTA_CACHE_TTL_MS = 5 * 60_000;
export const QUOTA_FORCE_COOLDOWN_MS = 30_000;

export interface UsageQuotaProvider {
	agent: UsageAccount["agent"];
	ttlMs?: number;
	capture: () => Promise<QuotaSnapshot<UsageAccount[]>>;
	subscribe?: (listener: () => void) => () => void;
	dispose?: () => Promise<void>;
}

// Separate caches isolate provider failures and credential changes. Every surface
// still shares each provider's one accepted request and polling limits.
export function createUsageQuotaReader(
	providers: UsageQuotaProvider[],
	now = Date.now,
) {
	const readers = providers.map(
		({ agent, capture, subscribe, dispose, ttlMs = QUOTA_CACHE_TTL_MS }) => {
			const cache = createQuotaCache(capture, ttlMs, now, {
				forceCooldownMs: QUOTA_FORCE_COOLDOWN_MS,
				retryOnFailure: true,
				freshUntil: (accounts) =>
					Math.min(
						now() + ttlMs,
						...accounts.map((account) => {
							const observedAt = Math.max(
								new Date(account.fetchedAt).getTime(),
								...account.windows.flatMap((window) => {
									if (
										window.source !== "claude_statusline" &&
										window.source !== "claude_sdk"
									)
										return [];
									const at = window.observedAt?.getTime();
									return at !== undefined &&
										Number.isFinite(at) &&
										at <= now() &&
										window.resetsAt !== null &&
										window.resetsAt.getTime() > now() &&
										Number.isFinite(window.usedPercent) &&
										window.usedPercent >= 0 &&
										window.usedPercent <= 100
										? [at]
										: [];
								}),
							);
							return Number.isFinite(observedAt) && observedAt <= now()
								? observedAt + Math.max(ttlMs, readQuotaRetry(account))
								: now() + ttlMs;
						}),
					),
				isFailure: (accounts) =>
					accounts.length > 0 &&
					accounts.every((account) => account.status === "unavailable"),
			});
			return {
				agent,
				cache,
				unsubscribe: subscribe?.(() => cache.expire()),
				dispose,
			};
		},
	);
	return {
		async get(forceRefresh = false): Promise<UsageAccount[]> {
			return (
				await Promise.all(
					readers.map(async ({ agent, cache }) => {
						try {
							return await cache.get(forceRefresh);
						} catch {
							return [
								{
									...unavailableQuotaAccount({
										agent,
										accountKey: `${agent}:discovery`,
										sourceLabel: `${agent} accounts`,
										selection: null,
									}),
									discoveryFailed: true,
								},
							];
						}
					}),
				)
			).flat();
		},
		async dispose() {
			for (const reader of readers) reader.unsubscribe?.();
			await Promise.all(readers.map((reader) => reader.dispose?.()));
		},
		expire(agent: UsageAccount["agent"]) {
			for (const reader of readers)
				if (reader.agent === agent) reader.cache.expire();
		},
		invalidate() {
			for (const { cache } of readers) cache.invalidate();
		},
	};
}
