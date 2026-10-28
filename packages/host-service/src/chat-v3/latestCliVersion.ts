import type { LatestVersionSource } from "./agentCliUpdate";

const DAY_MS = 24 * 60 * 60_000;
const FAILED_LOOKUP_RETRY_MS = 60 * 60_000;
const LOOKUP_TIMEOUT_MS = 4_000;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export type LatestCliVersion = (
	source: LatestVersionSource,
) => Promise<string | null>;

function lookupUrl(source: LatestVersionSource): string {
	if (source.kind === "npm") {
		return `https://registry.npmjs.org/-/package/${source.name}/dist-tags`;
	}
	return `https://formulae.brew.sh/api/${source.homebrewKind}/${source.name}.json`;
}

function readVersion(source: LatestVersionSource, body: unknown): unknown {
	if (typeof body !== "object" || body === null) return null;
	const record = body as Record<string, unknown>;
	if (source.kind === "npm") return record[source.tag];
	if (source.homebrewKind === "formula") {
		return (record.versions as Record<string, unknown> | undefined)?.stable;
	}
	// A cask version can carry a build suffix: "1.2.3,abc".
	return typeof record.version === "string"
		? record.version.split(",")[0]
		: null;
}

async function fetchLatest(
	fetchImpl: typeof fetch,
	source: LatestVersionSource,
): Promise<string | null> {
	const response = await fetchImpl(lookupUrl(source), {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
	});
	if (!response.ok) return null;
	const version = readVersion(source, await response.json());
	return typeof version === "string" && VERSION.test(version) ? version : null;
}

export function createLatestCliVersion(
	options: { fetch?: typeof fetch; now?: () => number } = {},
): LatestCliVersion {
	const fetchImpl = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const cache = new Map<
		string,
		{ expiresAt: number; version: Promise<string | null> }
	>();
	return (source) => {
		const key = lookupUrl(source) + (source.kind === "npm" ? source.tag : "");
		const hit = cache.get(key);
		if (hit && now() < hit.expiresAt) return hit.version;
		const entry = {
			expiresAt: now() + DAY_MS,
			version: fetchLatest(fetchImpl, source).catch(() => null),
		};
		cache.set(key, entry);
		void entry.version.then((version) => {
			if (version === null) entry.expiresAt = now() + FAILED_LOOKUP_RETRY_MS;
		});
		return entry.version;
	};
}

export const latestCliVersion = createLatestCliVersion();
