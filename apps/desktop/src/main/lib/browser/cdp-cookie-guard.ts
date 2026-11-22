const COOKIE_METHODS = new Set([
	"Network.getAllCookies",
	"Network.getCookies",
	"Network.setCookie",
	"Network.setCookies",
	"Network.deleteCookies",
	"Network.clearBrowserCookies",
	"Storage.getCookies",
	"Storage.setCookies",
	"Storage.clearCookies",
]);
const CLEAR_DATA_METHODS = new Set([
	"Storage.clearDataForOrigin",
	"Storage.clearDataForStorageKey",
]);
const COOKIE_HEADERS = new Set(["cookie", "set-cookie", "set-cookie2"]);
const HEADER_KEYS = new Set(["headers", "requestHeaders", "responseHeaders"]);
const HEADER_TEXT_KEYS = new Set(["headersText", "requestHeadersText"]);
const COOKIE_LIST_KEYS = new Set([
	"associatedCookies",
	"blockedCookies",
	"exemptedCookies",
]);
const REFUSAL =
	"Cookies are not available over CDP. Ask the user to import logins instead";

const isCookieHeader = (name: unknown) =>
	typeof name === "string" && COOKIE_HEADERS.has(name.toLowerCase());

function namesCookieHeader(headers: unknown): boolean {
	if (Array.isArray(headers)) {
		return headers.some((header) => isCookieHeader(header?.name));
	}
	return (
		typeof headers === "object" &&
		headers !== null &&
		Object.keys(headers).some(isCookieHeader)
	);
}

/** Agents never read or write the session's cookies; importing logins is the only way in. */
export function cookieRefusal(method: string, params: unknown): string | null {
	if (COOKIE_METHODS.has(method)) return REFUSAL;
	const p = (params ?? {}) as Record<string, unknown>;
	if (CLEAR_DATA_METHODS.has(method)) {
		const types = String(p.storageTypes ?? "").split(",");
		return types.some((type) => ["all", "cookies"].includes(type.trim()))
			? REFUSAL
			: null;
	}
	if (!method.startsWith("Network.") && !method.startsWith("Fetch.")) {
		return null;
	}
	return p.binaryResponseHeaders !== undefined ||
		namesCookieHeader(p.headers) ||
		namesCookieHeader(p.responseHeaders)
		? REFUSAL
		: null;
}

function withoutCookieHeaders(headers: unknown): unknown {
	if (Array.isArray(headers)) {
		return headers.filter((header) => !isCookieHeader(header?.name));
	}
	if (typeof headers !== "object" || headers === null) return headers;
	return Object.fromEntries(
		Object.entries(headers).filter(([name]) => !isCookieHeader(name)),
	);
}

function withoutCookieLines(text: unknown): unknown {
	if (typeof text !== "string") return text;
	return text
		.split("\r\n")
		.filter((line) => !isCookieHeader(line.split(":")[0]?.trim()))
		.join("\r\n");
}

function redact(value: unknown, depth: number): unknown {
	if (depth > 6 || typeof value !== "object" || value === null) return value;
	if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (COOKIE_LIST_KEYS.has(key)) continue;
		if (HEADER_KEYS.has(key)) out[key] = withoutCookieHeaders(item);
		else if (HEADER_TEXT_KEYS.has(key)) out[key] = withoutCookieLines(item);
		else out[key] = redact(item, depth + 1);
	}
	return out;
}

/** Strips cookie headers and cookie lists from Network and Fetch events. */
export function redactCookies(method: string, params: unknown): unknown {
	return method.startsWith("Network.") || method.startsWith("Fetch.")
		? redact(params, 0)
		: params;
}
