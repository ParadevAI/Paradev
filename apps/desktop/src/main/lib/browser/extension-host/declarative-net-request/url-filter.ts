const SEPARATOR = "(?:[^A-Za-z0-9_\\-.%]|$)";
// Past the scheme and any userinfo, at the host's start or after a dot in it.
const DOMAIN_ANCHOR =
	"^[a-z][a-z0-9+\\-.]*:\\/\\/(?:[^\\/?#]*@|(?![^\\/?#]*@))(?:[^\\/?#@:]*\\.)?";
const TOKEN_CHAR = /[a-z0-9%]/;
const TOKEN_RUN = /[a-z0-9%]+/g;
const DOMAIN_CHAR = /[a-z0-9.-]/;
// Characters that end the host in a `||host` filter.
const HOST_END = new Set(["^", "/", ":", "?", "|"]);
// Every web URL has these, so they select nothing.
const USELESS_TOKENS = new Set(["http", "https", "www", "ws", "wss"]);

interface ParsedFilter {
	domainAnchor: boolean;
	startAnchor: boolean;
	endAnchor: boolean;
	body: string;
}

function parse(filter: string): ParsedFilter {
	let body = filter;
	let domainAnchor = false;
	let startAnchor = false;
	if (body.startsWith("||")) {
		domainAnchor = true;
		body = body.slice(2);
	} else if (body.startsWith("|")) {
		startAnchor = true;
		body = body.slice(1);
	}
	const endAnchor = body.endsWith("|");
	if (endAnchor) body = body.slice(0, -1);
	return { domainAnchor, startAnchor, endAnchor, body };
}

/** Chrome's urlFilter syntax (`||`, `|`, `*`, `^`) as a RegExp. */
export function compileUrlFilter(
	filter: string,
	caseSensitive: boolean,
): RegExp {
	const { domainAnchor, startAnchor, endAnchor, body } = parse(filter);
	let source = domainAnchor ? DOMAIN_ANCHOR : startAnchor ? "^" : "";
	for (const char of body) {
		if (char === "*") source += ".*";
		else if (char === "^") source += SEPARATOR;
		else source += char.replace(/[\\^$+?.()|[\]{}/]/g, "\\$&");
	}
	if (endAnchor) source += "$";
	return new RegExp(source, caseSensitive ? "" : "i");
}

/** The host a `||host^` filter is pinned to, or null if it can match others. */
export function urlFilterDomain(filter: string): string | null {
	const { domainAnchor, body } = parse(filter);
	if (!domainAnchor) return null;
	const lower = body.toLowerCase();
	let end = 0;
	while (end < lower.length && DOMAIN_CHAR.test(lower[end] ?? "")) end++;
	if (end === 0) return null;
	const next = lower[end];
	const pinned = next === undefined ? filter.endsWith("|") : HOST_END.has(next);
	return pinned ? lower.slice(0, end) : null;
}

/**
 * Tokens every matching URL must contain as a whole run of [a-z0-9%]: a run
 * in the filter that is bounded on both sides by a non-token character or an
 * anchor, never by `*` or an open pattern edge.
 */
export function urlFilterTokens(filter: string): string[] {
	const { domainAnchor, startAnchor, endAnchor, body } = parse(filter);
	const lower = body.toLowerCase();
	const tokens: string[] = [];
	for (const match of lower.matchAll(TOKEN_RUN)) {
		const token = match[0];
		const start = match.index;
		const end = start + token.length;
		const before = start === 0 ? null : lower[start - 1];
		const after = end === lower.length ? null : lower[end];
		const leftBounded =
			before === null
				? domainAnchor || startAnchor
				: before !== "*" && !TOKEN_CHAR.test(before);
		const rightBounded =
			after === null ? endAnchor : after !== "*" && !TOKEN_CHAR.test(after);
		if (leftBounded && rightBounded && !USELESS_TOKENS.has(token)) {
			tokens.push(token);
		}
	}
	return tokens;
}

export function urlTokens(lowerUrl: string): Set<string> {
	return new Set(lowerUrl.match(TOKEN_RUN));
}
