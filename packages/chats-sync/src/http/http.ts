/** An API error response: `code` is the server's machine-readable `error`, `message` is safe to show. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		/** How long the server asked clients to wait (`Retry-After`), when it said. */
		readonly retryAfterMs?: number,
	) {
		super(message);
	}
}

export const isUnauthorized = (err: unknown) =>
	err instanceof ApiError && err.status === 401;

/**
 * The API, or the edge in front of it, asked this client to slow down: a 429, or a 403 page that isn't the API's JSON
 * (Vercel's DDoS challenge, which a native client can't solve). Retrying at once only keeps it on.
 */
export const isSlowDown = (err: unknown) =>
	err instanceof ApiError && (err.status === 429 || err.code === "challenged");

/** The longest first wait after a slow-down (jitter takes up to half off); each failure after it doubles it. */
const SLOW_DOWN_MS = 30_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 15_000;
const SLOW_DOWN_MAX_MS = 5 * 60_000;

/** Exponential backoff with full jitter, so clients don't all come back at the same moment after an outage. */
export function backoffMs(
	attempt: number,
	random: () => number = Math.random,
	baseMs = BACKOFF_BASE_MS,
	maxMs = BACKOFF_MAX_MS,
): number {
	const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
	return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

/**
 * How long to wait before retry `attempt` (1-based) after `err`: the usual backoff, but after a slow-down at least what
 * the server asked and growing from tens of seconds to minutes, so a client never keeps a challenge or a rate limit on.
 */
export function retryDelayMs(
	err: unknown,
	attempt: number,
	random: () => number = Math.random,
): number {
	if (!isSlowDown(err)) return backoffMs(attempt, random);
	const backoff = backoffMs(attempt, random, SLOW_DOWN_MS, SLOW_DOWN_MAX_MS);
	return Math.max(backoff, (err as ApiError).retryAfterMs ?? 0);
}

function retryAfterMs(header: string | null): number | undefined {
	if (!header) return undefined;
	const seconds = Number(header);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const at = Date.parse(header);
	return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/** The ApiError for a non-2xx response. */
async function errorOf(res: Response): Promise<ApiError> {
	const err = (await res.json().catch(() => ({}))) as {
		error?: string;
		message?: string;
	};
	const challenged = res.status === 403 && !err.error;
	const code = err.error ?? (challenged ? "challenged" : "http_error");
	const message =
		err.message ??
		(challenged || res.status === 429
			? "Paradev is busy. Try again in a few minutes."
			: `Request failed (${res.status})`);
	return new ApiError(
		res.status,
		code,
		message,
		retryAfterMs(res.headers.get("retry-after")),
	);
}

/** A GET answered with bytes (a file's content) rather than JSON; throws ApiError for non-2xx answers. */
export async function requestBytes(
	baseUrl: string,
	path: string,
	token?: string,
): Promise<Uint8Array> {
	const res = await fetch(`${baseUrl}${path}`, {
		headers: token ? { authorization: `Bearer ${token}` } : {},
	});
	if (!res.ok) throw await errorOf(res);
	return new Uint8Array(await res.arrayBuffer());
}

interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	token?: string;
	body?: unknown;
	/** Gives up after this long instead of the platform's default (60 s on iOS), for calls that are safe to repeat. */
	timeoutMs?: number;
}

/**
 * Request to the Dev API: `body` goes as JSON, or as it is when it's bytes (a file's part). Throws ApiError for
 * non-2xx answers and the fetch error when offline.
 */
export async function request<T>(
	baseUrl: string,
	path: string,
	{ method = "GET", token, body, timeoutMs }: RequestOptions = {},
): Promise<T> {
	const raw = body instanceof Uint8Array;
	const headers: Record<string, string> = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined)
		headers["content-type"] = raw
			? "application/octet-stream"
			: "application/json";
	const abort = timeoutMs ? new AbortController() : undefined;
	const timer = abort && setTimeout(() => abort.abort(), timeoutMs);
	try {
		const res = await fetch(`${baseUrl}${path}`, {
			method,
			headers,
			body:
				body === undefined
					? undefined
					: raw
						? (body as Uint8Array<ArrayBuffer>)
						: JSON.stringify(body),
			signal: abort?.signal,
		});
		if (!res.ok) throw await errorOf(res);
		if (res.status === 204) return undefined as T;
		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

/** Waits before each quiet repeat of a small change; its length is the number of repeats. */
export const QUIET_RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

/** A small change is given up on after this long, rather than iOS's 60 s, so its repeat comes soon. */
export const CHANGE_TIMEOUT_MS = 15_000;

/**
 * Runs `op`, repeating it after each of `delaysMs` while it gets no answer (offline, timed out). Only for changes that
 * give the same result when done twice. The server's refusals are final and thrown at once, as is the last failure.
 */
export async function retryOnNetworkError<T>(
	op: () => Promise<T>,
	delaysMs: number[] = QUIET_RETRY_DELAYS_MS,
): Promise<T> {
	for (const delay of delaysMs) {
		try {
			return await op();
		} catch (err) {
			if (err instanceof ApiError) throw err;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	return op();
}
