export interface ResetCredits {
	availableCount: number | null;
	expirations: Array<Date | string | null> | null;
	checkedAt: Date | string;
}
export function resetExpiryUrgency(
	nextExpiry: Date | null,
	now = Date.now(),
): "available" | "week" | "soon" | "urgent" {
	const remaining = nextExpiry ? nextExpiry.getTime() - now : NaN;
	if (remaining <= 24 * 60 * 60_000) return "urgent";
	if (remaining <= 3 * 24 * 60 * 60_000) return "soon";
	if (remaining <= 7 * 24 * 60 * 60_000) return "week";
	return "available";
}
export function liveResetCredits(
	credits: ResetCredits | undefined,
	now = Date.now(),
) {
	const age = credits ? now - new Date(credits.checkedAt).getTime() : NaN;
	if (
		!credits ||
		age < -60_000 ||
		age > 6 * 60_000 ||
		!Number.isFinite(age) ||
		credits.availableCount === null
	)
		return null;
	const expirations = credits.expirations?.filter(
		(d) => d === null || new Date(d).getTime() > now,
	);
	const count = expirations ? expirations.length : credits.availableCount;
	const nextExpiry =
		expirations
			?.filter((d): d is Date | string => d !== null)
			.map((d) => new Date(d))
			.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
	return { count, nextExpiry };
}
export const RESET_USAGE_URLS = {
	claude: "https://claude.ai/settings/usage",
	codex: "https://chatgpt.com/codex/settings/usage",
} as const;

export function recentQuotaReset(
	notice:
		| { kind: "session" | "weekly"; confirmedAt: Date | string }
		| undefined,
	now = Date.now(),
) {
	const age = notice ? now - new Date(notice.confirmedAt).getTime() : NaN;
	return Number.isFinite(age) && age >= 0 && age <= 10 * 60_000
		? (notice?.kind ?? null)
		: null;
}
