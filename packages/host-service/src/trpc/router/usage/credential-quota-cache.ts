import { readQuotaRetryHint } from "./quota-backoff";

const MAX_ENTRIES = 1024;
const MAX_EXPONENTIAL_DELAY_MS = 30 * 60_000;

// This cache follows one exact token/profile/account header. Inventory changes
// in a sibling account cannot clear its absolute server-requested pause.
export function createCredentialQuotaCache<T extends object>(
	ttlMs: number | ((value: T) => number) = 5 * 60_000,
	now = () => Date.now(),
	random = Math.random,
) {
	const freshFor = (value: T, pollingMs?: number) =>
		readQuotaRetryHint(value)
			? 0
			: pollingMs !== undefined && Number.isFinite(pollingMs) && pollingMs > 0
				? pollingMs
				: typeof ttlMs === "function"
					? ttlMs(value)
					: ttlMs;
	const entries = new Map<
		string,
		{ value?: T; fetchedAt: number; retryAt: number; pending?: Promise<T> }
	>();
	const transports = new Map<
		string,
		{
			value: T;
			fetchedAt: number;
			retryAt: number;
			failures: number;
			hint?: object;
		}
	>();
	const transportPending = new Map<string, Promise<T>>();
	return {
		invalidate(transportKey: string) {
			transports.delete(transportKey);
			transportPending.delete(transportKey);
			// Entry aliases contain no authority independent of their transport.
			entries.clear();
		},
		peek(transportKey: string) {
			return transports.get(transportKey);
		},
		fresh(transportKey: string, pollingMs?: number) {
			const value = transports.get(transportKey);
			return (
				!!value &&
				(now() < value.retryAt ||
					now() - value.fetchedAt < freshFor(value.value, pollingMs))
			);
		},
		retryAt(transportKey: string): number {
			return transports.get(transportKey)?.retryAt ?? 0;
		},
		get(
			key: string,
			load: () => Promise<T>,
			forceRefresh = false,
			transportKey = key,
			pollingMs?: number,
		): Promise<T> {
			const transport = transports.get(transportKey);
			if (
				transport &&
				(now() < transport.retryAt ||
					(!forceRefresh &&
						now() - transport.fetchedAt < freshFor(transport.value, pollingMs)))
			)
				return Promise.resolve(transport.value);
			let entry = entries.get(key);
			if (entry?.pending) return entry.pending;
			if (
				entry?.value &&
				(now() < entry.retryAt ||
					(!forceRefresh &&
						now() - entry.fetchedAt < freshFor(entry.value, pollingMs)))
			)
				return Promise.resolve(entry.value);
			if (!entry) {
				if (entries.size >= MAX_ENTRIES) {
					const disposable = [...entries].find(
						([, candidate]) => !candidate.pending && candidate.retryAt <= now(),
					);
					if (!disposable)
						return Promise.reject(
							new Error("Usage cache is busy. Try again shortly."),
						);
					entries.delete(disposable[0]);
				}
				entry = { fetchedAt: 0, retryAt: 0 };
				entries.set(key, entry);
			}
			const current = entry;
			let credentialRequest = transportPending.get(transportKey);
			if (!credentialRequest) {
				if (!transports.has(transportKey)) {
					const pendingNew = [...transportPending.keys()].filter(
						(key) => !transports.has(key),
					).length;
					if (transports.size + pendingNew >= MAX_ENTRIES) {
						const disposable = [...transports].find(
							([key, candidate]) =>
								candidate.retryAt <= now() && !transportPending.has(key),
						);
						if (!disposable)
							return Promise.reject(
								new Error("Usage cache is busy. Try again shortly."),
							);
						transports.delete(disposable[0]);
					}
				}
				const shared = Promise.resolve()
					.then(load)
					.then((value) => {
						if (transportPending.get(transportKey) !== shared)
							throw new Error(
								"Usage credential cache changed during the request.",
							);
						const previous = transports.get(transportKey);
						const hint = readQuotaRetryHint(value);
						const failures = hint
							? previous?.hint === hint
								? previous.failures
								: Math.min((previous?.failures ?? 0) + 1, 8)
							: 0;
						let retryAt = 0;
						if (hint) {
							if (previous?.hint === hint) retryAt = previous.retryAt;
							else {
								const base = hint.kind === "rate_limit" ? 5 * 60_000 : 30_000;
								const exponential = Math.min(
									MAX_EXPONENTIAL_DELAY_MS,
									base * 2 ** (failures - 1),
								);
								const jitter =
									failures > 1
										? Math.floor(
												exponential * 0.2 * Math.max(0, Math.min(1, random())),
											)
										: 0;
								retryAt =
									hint.retryAt ??
									now() +
										Math.max(
											hint.delayMs,
											Math.min(MAX_EXPONENTIAL_DELAY_MS, exponential + jitter),
										);
							}
						}
						transports.set(transportKey, {
							value,
							fetchedAt: now(),
							retryAt,
							failures,
							hint,
						});
						return value;
					})
					.catch((error: unknown) => {
						if (transportPending.get(transportKey) === shared)
							transports.delete(transportKey);
						throw error;
					})
					.finally(() => {
						if (transportPending.get(transportKey) === shared)
							transportPending.delete(transportKey);
					});
				credentialRequest = shared;
				transportPending.set(transportKey, shared);
			}
			const request = credentialRequest
				.then((value) => {
					current.value = value;
					current.fetchedAt = transports.get(transportKey)?.fetchedAt ?? now();
					current.retryAt = transports.get(transportKey)?.retryAt ?? 0;
					return value;
				})
				.catch((error: unknown) => {
					current.value = undefined;
					throw error;
				})
				.finally(() => {
					if (current.pending === request) current.pending = undefined;
				});
			current.pending = request;
			return request;
		},
	};
}
