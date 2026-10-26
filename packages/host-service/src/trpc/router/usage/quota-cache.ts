import {
	createQuotaRequestBudget,
	QUOTA_CAPTURE_BUDGET_MS,
} from "./quota-request";
export interface QuotaSnapshot<T> {
	revision: string;
	load: (forceRefresh?: boolean) => Promise<T>;
}

export function createQuotaCache<T>(
	capture: () => Promise<QuotaSnapshot<T>>,
	ttlMs: number,
	now = Date.now,
	options: {
		forceCooldownMs?: number;
		retryOnFailure?: boolean;
		isFailure?: (value: T) => boolean;
		retryDelay?: (value: T) => number;
		freshUntil?: (value: T) => number;
	} = {},
) {
	let generation = 0;
	let freshnessGeneration = 0;
	let lastAttempt = Number.NEGATIVE_INFINITY;
	let retryAt = 0;
	let failures = 0;
	let lastError: Error | undefined;
	let revision: string | undefined;
	let cached: { value: T; fetchedAt: number; freshUntil: number } | undefined;
	let pending: Promise<T> | undefined;
	let reading: Promise<unknown> = Promise.resolve();
	let checking: Promise<QuotaSnapshot<T>> | undefined;

	function invalidate() {
		generation++;
		cached = undefined;
		pending = undefined;
		retryAt = 0;
		lastError = undefined;
	}

	function inspect() {
		const result = reading
			.then(() =>
				createQuotaRequestBudget(QUOTA_CAPTURE_BUDGET_MS).run(() => capture()),
			)
			.then(
				(snapshot) => {
					if (snapshot.revision !== revision) {
						invalidate();
						revision = snapshot.revision;
					}
					return snapshot;
				},
				() => {
					invalidate();
					lastError = new Error(
						"Quota credentials could not be verified. Try again.",
					);
					failures = options.retryOnFailure ? failures + 1 : 0;
					retryAt =
						now() +
						(failures
							? Math.min(ttlMs, 30_000 * 2 ** Math.min(failures - 1, 4))
							: 0);
					throw lastError;
				},
			);
		reading = result.catch(() => {});
		return result;
	}

	return {
		async get(forceRefresh = false): Promise<T> {
			if (lastError && now() < retryAt) throw lastError;
			if (!checking) {
				const check = inspect().finally(() => {
					if (checking === check) checking = undefined;
				});
				checking = check;
			}
			const snapshot = await checking;
			if (pending) return pending;
			if (
				cached &&
				(now() < retryAt ||
					(forceRefresh
						? now() - lastAttempt < (options.forceCooldownMs ?? 0)
						: now() < cached.freshUntil))
			) {
				return cached.value;
			}
			const requestGeneration = generation;
			const requestFreshness = freshnessGeneration;
			lastAttempt = now();
			const request = Promise.resolve()
				.then(() =>
					createQuotaRequestBudget(9_000).run(() =>
						snapshot.load(forceRefresh),
					),
				)
				.then(async (value) => {
					const current = await inspect();
					if (
						generation !== requestGeneration ||
						current.revision !== snapshot.revision
					) {
						throw new Error(
							"Quota credentials changed during the request. Try again.",
						);
					}
					cached = {
						value,
						fetchedAt: now(),
						freshUntil:
							requestFreshness === freshnessGeneration
								? (options.freshUntil?.(value) ?? now() + ttlMs)
								: Number.NEGATIVE_INFINITY,
					};
					lastError = undefined;
					failures = options.isFailure?.(value) ? failures + 1 : 0;
					retryAt =
						now() +
						Math.max(
							options.retryDelay?.(value) ?? 0,
							failures
								? Math.min(ttlMs, 30_000 * 2 ** Math.min(failures - 1, 4))
								: 0,
						);
					if (requestFreshness !== freshnessGeneration) retryAt = 0;
					return value;
				})
				.catch((error: unknown) => {
					if (generation === requestGeneration) {
						cached = undefined;
						lastError = new Error(
							"Quota could not be verified. Try again shortly.",
						);
						failures = options.retryOnFailure ? failures + 1 : 0;
						retryAt =
							now() +
							(failures
								? Math.min(ttlMs, 30_000 * 2 ** Math.min(failures - 1, 4))
								: 0);
					}
					throw error;
				})
				.finally(() => {
					if (pending === request) pending = undefined;
				});
			pending = request;
			return request;
		},
		expire() {
			freshnessGeneration++;
			if (cached) cached.freshUntil = Number.NEGATIVE_INFINITY;
			retryAt = 0;
			lastError = undefined;
		},
		invalidate,
	};
}
