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

const PATTERN = /^(\*|[a-z][a-z0-9+.-]*):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/;
const ANY_SCHEME = new Set(["http:", "https:", "ws:", "wss:"]);

function globToRegExp(glob: string): RegExp {
	const escaped = glob
		.split("*")
		.map((part) => part.replace(/[\\^$+?.()|[\]{}]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${escaped}$`);
}

/** Chrome's match pattern rules, which Electron's webRequest filters use. */
export function urlMatchesPattern(pattern: string, raw: string): boolean {
	if (pattern === "<all_urls>") return true;
	const parts = PATTERN.exec(pattern);
	if (!parts) return false;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	const [, scheme, host, path] = parts as unknown as [
		string,
		string,
		string,
		string,
	];
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
	return hostMatches && globToRegExp(path).test(url.pathname + url.search);
}

interface Entry {
	hooks: WebRequestHooks;
	matches(url: string): boolean;
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
			matches: (url) =>
				hooks.urls.some((pattern) => urlMatchesPattern(pattern, url)),
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
