/**
 * How one app's links are recognised, as data: the hosts it lives on and, per address shape, what to call what it points
 * at. Built-in apps declare theirs in `builtin-link-rules.ts`; a plugin (a native app, a person's MCP server, a registry
 * Dev) brings its own as JSON, so recognising its links never means editing this package.
 */
export interface LinkRule {
	/** The app's slug: its plugin mark and name ("linear", "superset"). */
	app: string;
	/** Exact hosts, or `*.host` for the host and every subdomain of it; `www.` is ignored. */
	hosts: string[];
	/** Tried in order; the first whose shape fits and that names something wins. */
	patterns: LinkPattern[];
	/** Other spellings of an address (a desktop app's own scheme) and the web address each one means. */
	rewrites?: LinkRewrite[];
}

interface LinkPattern {
	/**
	 * A path: literal segments, `:name` to capture one, and a trailing `/**` for any rest (none included). It must match
	 * the whole path.
	 */
	path: string;
	/**
	 * What the address points at: a template (`"{key|upper}"`, `"{owner}/{repo}#{n}"`, with the filters `upper`, `short`
	 * for the first 8 characters, and `words` for a slug as a sentence), or, in code, a function of the captures and the
	 * rest of the path. Null or empty means the shape fits but names nothing, and the next pattern is tried.
	 */
	label:
		| string
		| ((captured: Record<string, string>, rest: string[]) => string | null);
	/** Captured values (case-insensitive) this pattern doesn't apply to: GitHub's own pages where an owner would be. */
	not?: Record<string, readonly string[]>;
}

interface LinkRewrite {
	/** An address with `:name` captures ("superset://v2-workspace/:id"). */
	from: string;
	/** The web address it means, with the same captures ("https://app.superset.sh/workspaces/:id"). */
	to: string;
}

/** What an address resolved to: the rule's app, the address as the web one, and the label its pattern gave, if any. */
export interface ResolvedLink {
	app: string;
	url: string;
	label: string | null;
}

const CAPTURE = "[A-Za-z0-9_-]+";
const NAME = /:([a-z][a-z0-9_]*)/gi;

const rewriteMatcher = (from: string) => {
	const names: string[] = [];
	const source = from
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/:([a-z][a-z0-9_]*)/gi, (_, name: string) => {
			names.push(name);
			return `(${CAPTURE})`;
		});
	return { names, source };
};

const fill = (template: string, values: Record<string, string>) =>
	template.replace(NAME, (_, name: string) => values[name] ?? "");

/** The matches of every rewrite's `from` in `text`, as the web addresses they mean, with where each was found. */
export function rewrittenAddresses(
	text: string,
	rules: readonly LinkRule[],
): { at: number; url: string }[] {
	const found: { at: number; url: string }[] = [];
	for (const rule of rules)
		for (const rewrite of rule.rewrites ?? []) {
			const { names, source } = rewriteMatcher(rewrite.from);
			// Not inside another address (a query value, a path), which only means what its own host says.
			for (const match of text.matchAll(
				new RegExp(`(?<![A-Za-z0-9=&?/%#:-])${source}`, "gi"),
			))
				found.push({
					at: match.index,
					url: fill(
						rewrite.to,
						Object.fromEntries(
							names.map((n, i) => [n, match[i + 1]!.toLowerCase()]),
						),
					),
				});
		}
	return found;
}

function rewritten(href: string, rules: readonly LinkRule[]): string {
	for (const rule of rules)
		for (const rewrite of rule.rewrites ?? []) {
			const { names, source } = rewriteMatcher(rewrite.from);
			const match = new RegExp(`^${source}(?:[/?#].*)?$`, "i").exec(href);
			if (match)
				return fill(
					rewrite.to,
					Object.fromEntries(
						names.map((n, i) => [n, match[i + 1]!.toLowerCase()]),
					),
				);
		}
	return href;
}

/** A web address as a plain URL, or null for anything else (a mailto, a typo, words with spaces). */
function webUrl(href: string): URL | null {
	if (/\s/.test(href)) return null;
	try {
		const url = new URL(href);
		return /^https?:$/.test(url.protocol) &&
			url.hostname &&
			!url.username &&
			!url.password
			? url
			: null;
	} catch {
		return null;
	}
}

const hostMatches = (host: string, pattern: string) =>
	pattern.startsWith("*.")
		? host === pattern.slice(2) || host.endsWith(pattern.slice(1))
		: host === pattern;

function segmentsOf(url: URL): string[] {
	return url.pathname
		.split("/")
		.filter(Boolean)
		.map((s) => {
			try {
				return decodeURIComponent(s);
			} catch {
				return s;
			}
		});
}

/** The captures if the path fits the pattern's shape, with whatever a trailing `/**` took. */
function fits(
	path: string,
	segments: string[],
): { captured: Record<string, string>; rest: string[] } | null {
	const shape = path.split("/").filter(Boolean);
	const open = shape.at(-1) === "**";
	const fixed = open ? shape.slice(0, -1) : shape;
	if (open ? segments.length < fixed.length : segments.length !== fixed.length)
		return null;
	const captured: Record<string, string> = {};
	for (const [i, part] of fixed.entries()) {
		if (part.startsWith(":")) captured[part.slice(1)] = segments[i]!;
		else if (part !== segments[i]) return null;
	}
	return { captured, rest: segments.slice(fixed.length) };
}

const FILTERS: Record<string, (value: string) => string> = {
	upper: (v) => v.toUpperCase(),
	short: (v) => v.slice(0, 8),
	words: (v) => {
		const text = v.replace(/[-_]+/g, " ").trim();
		return text.charAt(0).toUpperCase() + text.slice(1);
	},
};

/** A label template filled from the captures; null when one it names wasn't captured. */
function render(
	template: string,
	captured: Record<string, string>,
): string | null {
	let missing = false;
	const text = template.replace(
		/\{([a-z][a-z0-9_]*)((?:\|[a-z]+)*)\}/gi,
		(_, name: string, filters: string) => {
			const value = captured[name];
			if (value === undefined) {
				missing = true;
				return "";
			}
			return filters
				.split("|")
				.filter(Boolean)
				.reduce((v, filter) => FILTERS[filter]?.(v) ?? v, value);
		},
	);
	return missing ? null : text;
}

/**
 * Which app an address belongs to and what it points at, from the rules alone (no fetch). The address comes back as its
 * web one when a rule rewrites it. Null for anything that isn't a web address on a rule's host.
 */
export function resolveLink(
	href: string,
	rules: readonly LinkRule[],
): ResolvedLink | null {
	const address = rewritten(href, rules);
	const url = webUrl(address);
	if (!url) return null;
	const host = url.hostname.toLowerCase().replace(/^www\./, "");
	const rule = rules.find((r) => r.hosts.some((h) => hostMatches(host, h)));
	if (!rule) return null;
	const segments = segmentsOf(url);
	for (const pattern of rule.patterns) {
		const match = fits(pattern.path, segments);
		if (!match) continue;
		if (
			Object.entries(pattern.not ?? {}).some(([name, values]) =>
				values.some(
					(v) => v.toLowerCase() === match.captured[name]?.toLowerCase(),
				),
			)
		)
			continue;
		const label = (
			typeof pattern.label === "function"
				? pattern.label(match.captured, match.rest)
				: render(pattern.label, match.captured)
		)?.trim();
		if (label) return { app: rule.app, url: address, label };
	}
	return { app: rule.app, url: address, label: null };
}
