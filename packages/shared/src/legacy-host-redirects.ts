// Imported by apps/docs/next.config.mjs, which Node loads by stripping types:
// keep this file free of imports and TypeScript-only syntax.

export const LEGACY_ROOT_DOMAIN = "superset.sh";

export type LegacySite = "marketing" | "docs";

type RouteHas =
	| { type: "header" | "query" | "cookie"; key: string; value?: string }
	| { type: "host"; key?: undefined; value: string };

export interface HostRedirect {
	source: string;
	destination: string;
	permanent: boolean;
	has?: RouteHas[];
	missing?: RouteHas[];
}

// Paths that API, OAuth, MCP and analytics clients call by a fixed URL.
export const LEGACY_HOST_EXCLUDED_PATHS = [
	"mcp",
	".well-known",
	"api",
	"ingest",
	"monitoring",
];

function siteHosts(rootDomain: string) {
	return {
		marketing: {
			legacyHosts: [LEGACY_ROOT_DOMAIN, `www.${LEGACY_ROOT_DOMAIN}`],
			origin: `https://${rootDomain}`,
		},
		docs: {
			legacyHosts: [`docs.${LEGACY_ROOT_DOMAIN}`],
			origin: `https://docs.${rootDomain}`,
		},
	};
}

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Relative rules get a legacy-host copy with an absolute destination, so a
// legacy path on an old host reaches its final URL in one hop.
export function withLegacyHostRedirects<T extends HostRedirect>(
	redirects: T[],
	{ rootDomain, site }: { rootDomain: string; site: LegacySite },
): (T | HostRedirect)[] {
	if (rootDomain === LEGACY_ROOT_DOMAIN) return redirects;

	const sites = siteHosts(rootDomain);
	const { legacyHosts, origin } = sites[site];
	const newOrigins = new Map(
		Object.values(sites).flatMap((entry) =>
			entry.legacyHosts.map((host) => [host, entry.origin] as const),
		),
	);
	const rebase = (destination: string) => {
		if (destination.startsWith("/")) return `${origin}${destination}`;
		const match = /^https?:\/\/([^/?#]+)(.*)$/.exec(destination);
		const target = match && newOrigins.get(match[1] ?? "");
		return target ? `${target}${match?.[2] ?? ""}` : destination;
	};
	const onLegacyHost: RouteHas = {
		type: "host",
		value: `(?:${legacyHosts.map(escapeRegExp).join("|")})`,
	};
	const excluded = LEGACY_HOST_EXCLUDED_PATHS.map(escapeRegExp).join("|");

	return [
		...redirects.flatMap((redirect): (T | HostRedirect)[] => {
			const destination = rebase(redirect.destination);
			if (!redirect.destination.startsWith("/")) {
				return [{ ...redirect, destination }];
			}
			return [
				{
					...redirect,
					destination,
					has: [...(redirect.has ?? []), onLegacyHost],
				},
				redirect,
			];
		}),
		{
			source: `/:path((?!(?:${excluded})(?:/|$)).*)`,
			has: [onLegacyHost],
			destination: `${origin}/:path`,
			permanent: true,
		},
	];
}
