import type { UsageResetCredits } from "./types";

const MAX_CREDITS = 200;
const object = (v: unknown): Record<string, unknown> | null =>
	v !== null && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, unknown>)
		: null;
const count = (v: unknown): v is number =>
	typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_CREDITS;
function date(v: unknown): Date | null | undefined {
	if (v === null || v === undefined) return null;
	if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT/.test(v)) return undefined;
	const parsed = new Date(v);
	return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}
export function unknownResetCredits(now = new Date()): UsageResetCredits {
	return { availableCount: null, expirations: null, checkedAt: now };
}

export function parseClaudeResetCredits(
	raw: unknown,
	now = new Date(),
): UsageResetCredits {
	const block = object(raw);
	// Ineligibility can reject the requesting surface without revealing the balance.
	if (block?.eligible !== true) return unknownResetCredits(now);
	if (!Array.isArray(block.grants) || block.grants.length > MAX_CREDITS)
		return unknownResetCredits(now);
	const expirations: Array<Date | null> = [];
	let incomplete = false;
	for (const rawGrant of block.grants) {
		const grant = object(rawGrant);
		if (
			!grant ||
			!count(grant.resets_left) ||
			typeof grant.paused !== "boolean" ||
			(grant.resets_total !== undefined &&
				(!count(grant.resets_total) || grant.resets_total < grant.resets_left))
		) {
			incomplete = true;
			continue;
		}
		const start = date(grant.starts_at),
			end = date(grant.ends_at);
		if (start === undefined || end === undefined) {
			incomplete = true;
			continue;
		}
		if (grant.paused || (start && start > now) || (end && end <= now)) continue;
		if (expirations.length + grant.resets_left > MAX_CREDITS)
			return unknownResetCredits(now);
		for (let i = 0; i < grant.resets_left; i++) expirations.push(end);
	}
	// A partial response must not advertise an exact count or a false zero.
	if (incomplete) return unknownResetCredits(now);
	return { availableCount: expirations.length, expirations, checkedAt: now };
}

export function parseCodexResetCredits(
	summary: unknown,
	details: unknown,
	now = new Date(),
): UsageResetCredits {
	const reported = object(summary)?.available_count;
	const block = object(details);
	const fallback = {
		...unknownResetCredits(now),
		availableCount: count(reported) ? reported : null,
	};
	if (
		!block ||
		!Array.isArray(block.credits) ||
		block.credits.length > MAX_CREDITS
	)
		return fallback;
	const expirations: Array<Date | null> = [];
	const ids = new Set<string>();
	for (const raw of block.credits) {
		const credit = object(raw);
		if (!credit || typeof credit.status !== "string") return fallback;
		if (credit.status !== "available") continue;
		if (typeof credit.id !== "string" || !credit.id || ids.has(credit.id))
			return fallback;
		ids.add(credit.id);
		const expires = date(credit.expires_at);
		if (expires === undefined) return fallback;
		if (expires && expires <= now) continue;
		expirations.push(expires);
	}
	return { availableCount: expirations.length, expirations, checkedAt: now };
}
