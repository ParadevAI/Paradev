import { USAGE_LIMIT_ERROR_PREFIXES } from "@anthropic-ai/claude-agent-sdk";

/**
 * Claude's `rate_limit_info`, as the CLI streams it and as the ACP agent
 * forwards it under `_meta["_claude/rateLimit"]`. `resetsAt` is in seconds.
 */
export type RefusedWindow =
	/** Requests are refused; the window reopens at this time, when known. */
	| { resetsAtMs?: number; window?: string }
	/** Requests are allowed, or a refusal is being paid for by extra usage. */
	| null;

export function refusedWindow(rateLimitInfo: unknown): RefusedWindow {
	const info =
		typeof rateLimitInfo === "object" &&
		rateLimitInfo !== null &&
		!Array.isArray(rateLimitInfo)
			? (rateLimitInfo as Record<string, unknown>)
			: null;
	if (!info || info.status !== "rejected" || info.isUsingOverage === true) {
		return null;
	}
	const resetsAt = info.resetsAt;
	const window =
		typeof info.rateLimitType === "string" ? info.rateLimitType : undefined;
	return {
		...(typeof resetsAt === "number" && resetsAt > 0
			? { resetsAtMs: resetsAt < 1e12 ? resetsAt * 1000 : resetsAt }
			: {}),
		...(window ? { window } : {}),
	};
}

/**
 * The Claude ACP agent puts `{ errorKind, rateLimit }` on the error that fails
 * a turn. A turn refused before its first usage has no usage update to carry
 * the window, so this is its only structured report.
 */
export function refusedWindowOfError(data: unknown): RefusedWindow {
	if (typeof data !== "object" || data === null) return null;
	return refusedWindow((data as Record<string, unknown>).rateLimit);
}

const ACP_INTERNAL_ERROR_LABEL = /^Internal error:\s*/;

/** Claude Code's own list of how its usage refusals start. */
export function isClaudeUsageRefusal(text: string): boolean {
	const words = text.replace(ACP_INTERNAL_ERROR_LABEL, "");
	return USAGE_LIMIT_ERROR_PREFIXES.some((prefix) => words.startsWith(prefix));
}

const USAGE_ERROR_KINDS = new Set(["rate_limit", "billing_error"]);

/**
 * The Claude ACP agent gives a usage refusal and a passing rate limit the same
 * `errorKind`, and tells them apart by the CLI's words as this does. It puts
 * JSON-RPC's "Internal error" label in front of those words.
 */
export function isClaudeUsageError(data: unknown, message: string): boolean {
	if (typeof data !== "object" || data === null) return false;
	const kind = (data as Record<string, unknown>).errorKind;
	return (
		typeof kind === "string" &&
		USAGE_ERROR_KINDS.has(kind) &&
		isClaudeUsageRefusal(message)
	);
}
