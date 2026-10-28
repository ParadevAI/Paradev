// Imported by Node-loaded build configs, which strip types: keep this file
// free of imports and of syntax that needs transpiling (enums, namespaces).

// Both serve during the rename; released clients keep calling superset.sh.
export const OWN_ROOT_DOMAINS: readonly string[] = [
	"superset.sh",
	"paradev.com",
];

const HOST_PATTERN = /^([a-z][a-z0-9+.-]*:\/\/)?([^/:?#\s]+)(.*)$/i;

function ownRootOf(host: string): string | undefined {
	const lower = host.toLowerCase();
	return OWN_ROOT_DOMAINS.find(
		(root) => lower === root || lower.endsWith(`.${root}`),
	);
}

export function isOwnHost(host: string): boolean {
	return ownRootOf(host) !== undefined;
}

/**
 * Each value, plus the same value on every other own root domain. Accepts
 * origins, URLs, bare hosts and CSP sources such as `wss://*.superset.sh`;
 * values on other hosts pass through unchanged.
 */
export function withOwnDomainTwins(
	values: readonly (string | null | undefined | false)[],
): string[] {
	const result = new Set<string>();
	for (const value of values) {
		if (!value) continue;
		result.add(value);
		const match = HOST_PATTERN.exec(value);
		const host = match?.[2];
		const root = host && ownRootOf(host);
		if (!match || !host || !root) continue;
		const subdomain = host.slice(0, host.length - root.length);
		for (const other of OWN_ROOT_DOMAINS) {
			if (other === root) continue;
			result.add(`${match[1] ?? ""}${subdomain}${other}${match[3] ?? ""}`);
		}
	}
	return [...result];
}

/** True when `origin` is `configuredOrigin` or its twin on another own root domain. */
export function isOwnOriginTwin(
	origin: string,
	configuredOrigin: string,
): boolean {
	return withOwnDomainTwins([configuredOrigin]).includes(origin);
}
