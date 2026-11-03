import type { Session } from "electron";

type BeforeRequest = (
	details: Electron.OnBeforeRequestListenerDetails,
) => Electron.CallbackResponse | undefined;
type BeforeSendHeaders = (
	details: Electron.OnBeforeSendHeadersListenerDetails,
	requestHeaders: Record<string, string>,
) => Record<string, string> | undefined;
type HeadersReceived = (
	details: Electron.OnHeadersReceivedListenerDetails,
	responseHeaders: Record<string, string[]>,
) => Record<string, string[]> | undefined;

export interface WebRequestHooks {
	/** Electron URL patterns, such as `https://example.com/*` or `*://*\/*`. */
	urls: string[];
	/** The first hook to cancel or redirect decides; later hooks are skipped. */
	onBeforeRequest?: BeforeRequest;
	/** Each hook gets the headers the previous one returned. */
	onBeforeSendHeaders?: BeforeSendHeaders;
	onHeadersReceived?: HeadersReceived;
}

const PATTERN =
	/^(\*|[a-z][a-z0-9+.-]*):\/\/(\*|\*\.[^/*:]+|\[[^\]]+\]|[^/*:]+)(?::(\*|\d+))?(\/.*)$/;
const ANY_SCHEME = new Set(["http:", "https:", "ws:", "wss:"]);
const DEFAULT_PORTS: Record<string, string> = {
	"http:": "80",
	"https:": "443",
	"ws:": "80",
	"wss:": "443",
};

type UrlMatcher = (url: URL) => boolean;

/** `*` matches any run of characters. Never backtracks past the last `*`, so it is O(glob × text) at worst. */
export function globMatches(glob: string, text: string): boolean {
	let g = 0;
	let t = 0;
	let star = -1;
	let resume = 0;
	while (t < text.length) {
		if (g < glob.length && glob[g] === "*") {
			star = g++;
			resume = t;
		} else if (g < glob.length && glob[g] === text[t]) {
			g++;
			t++;
		} else if (star !== -1) {
			g = star + 1;
			t = ++resume;
		} else {
			return false;
		}
	}
	while (g < glob.length && glob[g] === "*") g++;
	return g === glob.length;
}

function compilePattern(pattern: string): UrlMatcher {
	if (pattern === "<all_urls>") return () => true;
	const parts = PATTERN.exec(pattern);
	if (!parts) return () => false;
	const [, scheme, host, port, path] = parts as unknown as [
		string,
		string,
		string,
		string | undefined,
		string,
	];
	return (url) => {
		if (
			scheme === "*"
				? !ANY_SCHEME.has(url.protocol)
				: `${scheme}:` !== url.protocol
		) {
			return false;
		}
		const hostname = url.hostname;
		const hostMatches =
			host === "*" ||
			host === hostname ||
			(host.startsWith("*.") &&
				(hostname === host.slice(2) || hostname.endsWith(host.slice(1))));
		if (!hostMatches) return false;
		if (port !== undefined && port !== "*") {
			const urlPort = url.port || DEFAULT_PORTS[url.protocol] || "";
			if (urlPort !== port) return false;
		}
		return globMatches(path, url.pathname + url.search);
	};
}

const compiled = new Map<string, UrlMatcher>();

const COMPILED_LIMIT = 1_000;

function matcherFor(pattern: string): UrlMatcher {
	let matcher = compiled.get(pattern);
	if (!matcher) {
		matcher = compilePattern(pattern);
		if (compiled.size >= COMPILED_LIMIT) compiled.clear();
		compiled.set(pattern, matcher);
	}
	return matcher;
}

function parseUrl(raw: string): URL | null {
	try {
		return new URL(raw);
	} catch {
		return null;
	}
}

/** Chrome's match pattern rules, which Electron's webRequest filters use. */
export function urlMatchesPattern(pattern: string, raw: string | URL): boolean {
	if (pattern === "<all_urls>") return true;
	const url = typeof raw === "string" ? parseUrl(raw) : raw;
	return url !== null && matcherFor(pattern)(url);
}

interface Entry {
	hooks: WebRequestHooks;
	matches(url: string): boolean;
}

function urlsMatcher(patterns: string[]): (raw: string) => boolean {
	const matchers = patterns.map(matcherFor);
	let lastRaw: string | null = null;
	let lastUrl: URL | null = null;
	return (raw) => {
		if (raw !== lastRaw) {
			lastRaw = raw;
			lastUrl = parseUrl(raw);
		}
		const url = lastUrl;
		return url !== null && matchers.some((matcher) => matcher(url));
	};
}

/**
 * Electron keeps one listener per webRequest event per session; a second
 * registration replaces the first. Everything that hooks a session's requests
 * goes through here, so the hooks compose instead of evicting each other.
 */
export class WebRequestHub {
	private readonly entries: Entry[] = [];

	constructor(private readonly session: Session) {}

	add(hooks: WebRequestHooks): () => void {
		const entry: Entry = {
			hooks,
			matches: urlsMatcher(hooks.urls),
		};
		this.entries.push(entry);
		this.sync();
		return () => {
			const index = this.entries.indexOf(entry);
			if (index === -1) return;
			this.entries.splice(index, 1);
			this.sync();
		};
	}

	private filterFor(event: keyof Omit<WebRequestHooks, "urls">) {
		const entries = this.entries.filter((entry) => entry.hooks[event]);
		if (entries.length === 0) return null;
		return {
			entries,
			filter: {
				urls: [...new Set(entries.flatMap((entry) => entry.hooks.urls))],
			},
		};
	}

	private sync(): void {
		const { webRequest } = this.session;

		const beforeRequest = this.filterFor("onBeforeRequest");
		if (beforeRequest) {
			webRequest.onBeforeRequest(beforeRequest.filter, (details, callback) => {
				callback(this.runBeforeRequest(beforeRequest.entries, details));
			});
		} else webRequest.onBeforeRequest(null);

		const sendHeaders = this.filterFor("onBeforeSendHeaders");
		if (sendHeaders) {
			webRequest.onBeforeSendHeaders(
				sendHeaders.filter,
				(details, callback) => {
					let headers = details.requestHeaders;
					let changed = false;
					for (const entry of sendHeaders.entries) {
						if (!entry.matches(details.url)) continue;
						const next = safely(() =>
							entry.hooks.onBeforeSendHeaders?.(details, headers),
						);
						if (next) {
							headers = next;
							changed = true;
						}
					}
					callback(changed ? { requestHeaders: headers } : {});
				},
			);
		} else webRequest.onBeforeSendHeaders(null);

		const headersReceived = this.filterFor("onHeadersReceived");
		if (headersReceived) {
			webRequest.onHeadersReceived(
				headersReceived.filter,
				(details, callback) => {
					let headers = details.responseHeaders ?? {};
					let changed = false;
					for (const entry of headersReceived.entries) {
						if (!entry.matches(details.url)) continue;
						const next = safely(() =>
							entry.hooks.onHeadersReceived?.(details, headers),
						);
						if (next) {
							headers = next;
							changed = true;
						}
					}
					callback(changed ? { responseHeaders: headers } : {});
				},
			);
		} else webRequest.onHeadersReceived(null);
	}

	private runBeforeRequest(
		entries: Entry[],
		details: Electron.OnBeforeRequestListenerDetails,
	): Electron.CallbackResponse {
		for (const entry of entries) {
			if (!entry.matches(details.url)) continue;
			const response = safely(() => entry.hooks.onBeforeRequest?.(details));
			if (response?.cancel || response?.redirectURL) return response;
		}
		return {};
	}
}

function safely<T>(run: () => T): T | undefined {
	try {
		return run();
	} catch (error) {
		console.error("[web-request-hub] A hook failed:", error);
		return undefined;
	}
}

const hubs = new WeakMap<Session, WebRequestHub>();

export function webRequestHub(session: Session): WebRequestHub {
	let hub = hubs.get(session);
	if (!hub) {
		hub = new WebRequestHub(session);
		hubs.set(session, hub);
	}
	return hub;
}
