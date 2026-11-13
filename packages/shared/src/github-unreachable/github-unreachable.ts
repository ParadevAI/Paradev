/**
 * Node and undici codes meaning the request never reached GitHub. Same family
 * as the cloud-API unreachable list, minus the TLS-interception codes: a
 * corporate proxy that re-signs github.com is a reason to stop retrying too,
 * but it reports as a different problem and is left to surface as one.
 */
const UNREACHABLE_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_SOCKET",
]);

// `gh` reports transport failures as prose on stderr. A resolver failure is
// wrapped by gh itself ("error connecting to <host> / check your internet
// connection", verified on gh 2.98); the rest are Go's net package phrasings
// that surface for refused, reset, and timed-out connections.
const UNREACHABLE_STDERR =
	/error connecting to|check your internet connection|no such host|dial tcp|i\/o timeout|connect timeout|tls handshake timeout|network is unreachable|connection refused|connection reset|getaddrinfo/i;

const MAX_CAUSE_DEPTH = 8;

function codeOf(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	const code = (value as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
}

function textOf(value: unknown): string {
	if (typeof value !== "object" || value === null) return "";
	const { stderr, message } = value as { stderr?: unknown; message?: unknown };
	return [stderr, message]
		.filter((part): part is string => typeof part === "string")
		.join("\n");
}

export function isGitHubUnreachableError(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth++) {
		const code = codeOf(current);
		if (code && UNREACHABLE_CODES.has(code)) return true;
		// execFile's timeout: the child was killed before it produced a result.
		// For `gh` that is a hung network call; a fast failure exits on its own.
		const { killed, signal } = current as {
			killed?: unknown;
			signal?: unknown;
		};
		if (killed === true && typeof signal === "string") return true;
		if (UNREACHABLE_STDERR.test(textOf(current))) return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}
