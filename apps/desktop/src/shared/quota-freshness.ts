export const QUOTA_PROVIDER_FRESHNESS_MS = 16 * 60_000;
export const QUOTA_NATIVE_FRESHNESS_MS = 6 * 60_000;

/** Missing source is a legacy provider response; an unknown explicit source is not proof. */
export function quotaObservationFreshnessMs(
	source?: string | null,
): number | null {
	if (source === undefined || source === "provider")
		return QUOTA_PROVIDER_FRESHNESS_MS;
	if (source === "claude_statusline" || source === "claude_sdk")
		return QUOTA_NATIVE_FRESHNESS_MS;
	return null;
}

/** Each observation keeps its own age. An unrelated HTTP/native sample cannot renew it. */
export function quotaObservationFresh(
	window: { source?: string | null; observedAt?: Date | string | null },
	fallbackFetchedAt: Date | string | null | undefined,
	now = Date.now(),
): boolean {
	const limit = quotaObservationFreshnessMs(window.source);
	const observedAt = window.observedAt ?? fallbackFetchedAt;
	if (
		limit === null ||
		observedAt === null ||
		observedAt === undefined ||
		!(typeof observedAt === "string" || observedAt instanceof Date)
	)
		return false;
	const age = now - new Date(observedAt).getTime();
	return Number.isFinite(age) && age >= 0 && age <= limit;
}
