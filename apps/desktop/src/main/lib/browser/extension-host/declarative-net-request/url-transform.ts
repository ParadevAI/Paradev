import type { UrlTransform } from "./types";

function transformQuery(
	search: string,
	{
		removeParams,
		addOrReplaceParams,
	}: NonNullable<UrlTransform["queryTransform"]>,
): string {
	const pairs = search
		.replace(/^\?/, "")
		.split("&")
		.filter((pair) => pair !== "")
		.map((pair) => {
			const equals = pair.indexOf("=");
			return equals === -1
				? { key: pair, value: null as string | null }
				: { key: pair.slice(0, equals), value: pair.slice(equals + 1) };
		});
	const removed = new Set(removeParams ?? []);
	const kept = pairs.filter(({ key }) => !removed.has(decodeKey(key)));
	for (const { key, value, replaceOnly } of addOrReplaceParams ?? []) {
		const existing = kept.find((pair) => decodeKey(pair.key) === key);
		if (existing) existing.value = encodeURIComponent(value);
		else if (!replaceOnly) {
			kept.push({
				key: encodeURIComponent(key),
				value: encodeURIComponent(value),
			});
		}
	}
	const query = kept
		.map(({ key, value }) => (value === null ? key : `${key}=${value}`))
		.join("&");
	return query ? `?${query}` : "";
}

function decodeKey(key: string): string {
	try {
		return decodeURIComponent(key.replace(/\+/g, " "));
	} catch {
		return key;
	}
}

/** A redirect's `transform`, applied to the request URL; null if it fails. */
export function applyUrlTransform(
	raw: string,
	transform: UrlTransform,
): string | null {
	// Runs in the request path, so a malformed transform must fail, never throw.
	try {
		return transformed(new URL(raw), transform);
	} catch {
		return null;
	}
}

function transformed(url: URL, transform: UrlTransform): string | null {
	if (transform.scheme) {
		url.protocol = `${transform.scheme}:`;
		if (url.protocol !== `${transform.scheme.toLowerCase()}:`) return null;
	}
	if (transform.host !== undefined) {
		if (typeof transform.host !== "string") return null;
		const before = url.hostname;
		url.hostname = transform.host;
		const ignored =
			url.hostname === before &&
			transform.host.toLowerCase() !== before.toLowerCase();
		// The setter stops at a delimiter and keeps only the part before it.
		const truncated =
			!/^\[[0-9a-f:.]+\]$/i.test(transform.host) &&
			/[/?#:@\\\s]/.test(transform.host);
		if (ignored || truncated) return null;
	}
	if (transform.port !== undefined) {
		if (!/^\d{0,5}$/.test(transform.port) || Number(transform.port) > 65_535) {
			return null;
		}
		url.port = transform.port;
	}
	if (transform.path !== undefined) url.pathname = transform.path || "/";
	if (transform.query !== undefined) url.search = transform.query;
	else if (transform.queryTransform) {
		url.search = transformQuery(url.search, transform.queryTransform);
	}
	if (transform.fragment !== undefined) url.hash = transform.fragment;
	if (transform.username !== undefined) url.username = transform.username;
	if (transform.password !== undefined) url.password = transform.password;
	return url.href;
}
