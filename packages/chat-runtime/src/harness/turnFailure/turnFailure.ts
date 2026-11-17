import type { TurnFailureKind } from "@superset/chat/protocol";

export type TurnFailureSignal = {
	message: string;
	/** The agent process exited or closed while the turn ran. */
	exited?: boolean;
	/** The agent did not answer a request in time. */
	timedOut?: boolean;
	/** The JSON-RPC error code the agent answered with. */
	code?: number;
};

/** ACP's `auth_required`. */
const ACP_AUTH_REQUIRED = -32000;
const ACP_RESOURCE_NOT_FOUND = -32002;

const SESSION_LOST =
	/unknown sessionid|session not found|no conversation found|no rollout found/i;

/** Checked in order: the first that matches names the failure. */
const TEXT_RULES: readonly [TurnFailureKind, RegExp][] = [
	["crashed", /acp agent (?:exited|closed)/i],
	["session_lost", SESSION_LOST],
	[
		"auth",
		/\b(?:status|code|error)\W{1,3}40[13]\b|unauthori[sz]ed|forbidden|authenticat|not (?:logged|signed) in|(?:please |to )?run \/login\b|(?:log|sign) ?in (?:again|required)|invalid (?:x-)?api[ _-]?key|api[ _-]?key (?:is )?(?:invalid|missing|expired|revoked)|token (?:has )?(?:expired|been revoked|is invalid)|(?:invalid|missing|expired|no) credentials|credentials? (?:(?:are|is|have) )?(?:invalid|missing|expired|not found|revoked)/i,
	],
	[
		"context_too_long",
		/prompt is too long|context(?: |_)(?:length|window)|maximum context|too many (?:input )?tokens|input (?:is )?too long|request too large|\b(?:status|code|error)\W{1,3}413\b|(?:exceeds?|over) (?:the )?(?:model'?s? )?(?:maximum |max )?(?:context|token)/i,
	],
	[
		"model_unavailable",
		/\bmodel\b[^.\n]{0,60}\b(?:not (?:found|available|supported)|unavailable|does(?: not|n't) exist|deprecated)|(?:unknown|invalid|unsupported) model|model_not_found|issue with the selected model|not_found_error[^\n]*\bmodel\b|no access to (?:the |this )?model/i,
	],
	[
		"timeout",
		/timed? ?out|timeout|ETIMEDOUT|did not answer within|deadline exceeded/i,
	],
	[
		"network",
		/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|socket hang up|fetch failed|network (?:error|is unreachable|request failed)|disconnected|connection (?:error|reset|refused|closed|lost)|getaddrinfo|overloaded|bad gateway|service unavailable|internal server error|\b(?:status|code|error)\W{1,3}5\d\d\b/i,
	],
	[
		"refused",
		/refus(?:ed|al)|declined to|content (?:filter|policy)|usage polic(?:y|ies)|safety (?:filter|system)/i,
	],
];

export function classifyTurnFailure(
	signal: TurnFailureSignal,
): TurnFailureKind {
	if (signal.exited) return "crashed";
	if (signal.timedOut) return "timeout";
	if (signal.code === ACP_AUTH_REQUIRED) return "auth";
	if (signal.code === ACP_RESOURCE_NOT_FOUND) return "session_lost";
	return (
		TEXT_RULES.find(([, pattern]) => pattern.test(signal.message))?.[0] ??
		"unknown"
	);
}
