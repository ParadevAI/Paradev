// Retry hints stay private. They are cache policy, not public account metadata.
type QuotaRetryHint = {
	delayMs: number;
	kind: "rate_limit" | "transient";
	retryAt?: number;
};
const retryHints = new WeakMap<object, QuotaRetryHint>();
const responseRetries = new WeakMap<object, number>();
export function setQuotaResponseRetry<T extends object>(
	response: T,
	retryAt: number,
): T {
	responseRetries.set(response, retryAt);
	return response;
}
const MAX_RETRY_DELAY_MS = 24 * 60 * 60_000;

export function quotaRetryDelay(
	header: string | null,
	now = Date.now(),
): number {
	if (!header) return 0;
	const text = header.trim();
	if (!/^\d+$/.test(text) && !/^[A-Za-z]{3}/.test(text)) return 0;
	const delay = /^\d+$/.test(text)
		? Number(text) * 1000
		: Date.parse(text) - now;
	return Number.isFinite(delay)
		? Math.min(MAX_RETRY_DELAY_MS, Math.max(0, delay))
		: 0;
}

export function recordQuotaRetry<T extends object>(
	value: T,
	response: Pick<Response, "status" | "headers">,
): T {
	retryHints.delete(value);
	if ([408, 429, 500, 502, 503, 504, 529].includes(response.status)) {
		retryHints.set(value, {
			kind: response.status === 429 ? "rate_limit" : "transient",
			retryAt: responseRetries.get(response),
			delayMs: Math.max(
				response.status === 429 ? 5 * 60_000 : 30_000,
				quotaRetryDelay(response.headers?.get("retry-after") ?? null),
			),
		});
	}
	return value;
}

export function copyQuotaRetry<T extends object>(source: object, target: T): T {
	const hint = retryHints.get(source);
	retryHints.delete(target);
	if (hint) retryHints.set(target, hint);
	return target;
}

export function readQuotaRetry(value: object): number {
	return retryHints.get(value)?.delayMs ?? 0;
}

export function readQuotaRetryHint(
	value: object,
): Readonly<QuotaRetryHint> | undefined {
	return retryHints.get(value);
}
