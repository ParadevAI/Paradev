import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";
import {
	type HostRedirect,
	withLegacyHostRedirects,
} from "@superset/shared/legacy-host-redirects";
import { formatUrl } from "next/dist/shared/lib/router/utils/format-url";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import {
	matchHas,
	prepareDestination,
} from "next/dist/shared/lib/router/utils/prepare-destination";
import { getBlogPosts } from "./blog";
import { getComparisonPages } from "./compare";
import {
	buildLegacyRedirects,
	LEGACY_DOCS_REDIRECTS,
	LEGACY_PAGE_REDIRECTS,
} from "./legacy-redirects";

const DOCS_URL = "https://docs.example.test";
const redirects = buildLegacyRedirects({
	locales: SUPPORTED_LOCALES,
	docsUrl: DOCS_URL,
});

function resolve(pathname: string) {
	for (const redirect of redirects) {
		const params = getPathMatch(redirect.source)(pathname);
		if (!params) continue;
		return {
			permanent: redirect.permanent,
			destination: redirect.destination.replace(":lang", String(params.lang)),
		};
	}
	return null;
}

const blogPaths = new Set(getBlogPosts().map((post) => `/blog/${post.slug}`));
const comparePaths = new Set(getComparisonPages().map((page) => page.url));

function isLivePage(pathname: string) {
	return (
		blogPaths.has(pathname) ||
		comparePaths.has(pathname) ||
		existsSync(`src/app/[lang]${pathname}/page.tsx`)
	);
}

const legacySources = new Set([
	...Object.keys(LEGACY_PAGE_REDIRECTS),
	...Object.keys(LEGACY_DOCS_REDIRECTS),
]);

describe("legacy redirects", () => {
	test("every page target is a live page that does not redirect again", () => {
		for (const destination of Object.values(LEGACY_PAGE_REDIRECTS)) {
			expect({ destination, live: isLivePage(destination) }).toEqual({
				destination,
				live: true,
			});
			expect(legacySources.has(destination)).toBe(false);
		}
	});

	test("every docs target is a live docs page", () => {
		for (const destination of Object.values(LEGACY_DOCS_REDIRECTS)) {
			expect(
				existsSync(`../docs/content/docs${destination}.mdx`),
				destination,
			).toBe(true);
		}
	});

	test("English and localized paths redirect permanently in one hop", () => {
		for (const [source, destination] of Object.entries(LEGACY_PAGE_REDIRECTS)) {
			expect(resolve(source)).toEqual({ permanent: true, destination });
			expect(resolve(`/en${source}`)).toEqual({ permanent: true, destination });
			expect(resolve(`/ja${source}`)).toEqual({
				permanent: true,
				destination: `/ja${destination}`,
			});
		}
		for (const [source, destination] of Object.entries(LEGACY_DOCS_REDIRECTS)) {
			expect(resolve(source)).toEqual({
				permanent: true,
				destination: `${DOCS_URL}${destination}`,
			});
		}
	});

	test("leaves live pages alone", () => {
		for (const pathname of [...blogPaths, ...comparePaths]) {
			expect(resolve(pathname)).toBeNull();
		}
	});
});

describe("legacy hosts after a root domain change", () => {
	const rootDomain = "example.org";
	const marketing = withLegacyHostRedirects(
		[
			{ source: "/about", destination: "/team", permanent: true },
			{
				source: "/mcp",
				destination: "https://api.superset.sh/mcp",
				permanent: false,
			},
			{
				source: "/docs/:path*",
				destination: "https://docs.superset.sh/:path*",
				permanent: false,
			},
			...buildLegacyRedirects({
				locales: SUPPORTED_LOCALES,
				docsUrl: "https://docs.superset.sh",
			}),
		],
		{ rootDomain, site: "marketing" },
	);
	const docs = withLegacyHostRedirects(
		[
			{ source: "/docs/:path*", destination: "/:path*", permanent: true },
			{ source: "/getting-started", destination: "/overview", permanent: true },
		],
		{ rootDomain, site: "docs" },
	);
	const rulesByHost: Record<string, HostRedirect[]> = {
		"superset.sh": marketing,
		"www.superset.sh": marketing,
		"example.org": marketing,
		"docs.superset.sh": docs,
		"docs.example.org": docs,
	};

	function redirectOnce(url: string, rules?: HostRedirect[]) {
		const { hostname, pathname, searchParams } = new URL(url);
		const query = Object.fromEntries(searchParams);
		for (const rule of rules ?? rulesByHost[hostname] ?? []) {
			const params = getPathMatch(rule.source)(pathname);
			if (!params) continue;
			const hostParams = matchHas(
				{ headers: { host: hostname } } as never,
				query,
				rule.has as never,
			);
			if (!hostParams) continue;
			const { parsedDestination } = prepareDestination({
				appendParamsToQuery: false,
				destination: rule.destination,
				params: { ...params, ...hostParams },
				query,
			});
			return {
				permanent: rule.permanent,
				url: new URL(formatUrl(parsedDestination), url).href,
			};
		}
		return null;
	}

	function follow(url: string) {
		const hops: string[] = [];
		let next = redirectOnce(url);
		while (next && hops.length < 5) {
			hops.push(next.url);
			next = redirectOnce(next.url);
		}
		return hops;
	}

	test("keeps the path and query on the new host", () => {
		expect(redirectOnce("https://superset.sh/")).toEqual({
			permanent: true,
			url: "https://example.org/",
		});
		expect(follow("https://www.superset.sh/ja/pricing?ref=x&y=1")).toEqual([
			"https://example.org/ja/pricing?ref=x&y=1",
		]);
		expect(follow("https://docs.superset.sh/agents/claude?q=1")).toEqual([
			"https://docs.example.org/agents/claude?q=1",
		]);
	});

	test("sends legacy paths to their final URL in one hop", () => {
		expect(follow("https://superset.sh/about")).toEqual([
			"https://example.org/team",
		]);
		expect(follow("https://superset.sh/docs/automations")).toEqual([
			"https://docs.example.org/automations",
		]);
		expect(follow("https://docs.superset.sh/getting-started")).toEqual([
			"https://docs.example.org/overview",
		]);
		for (const [source, destination] of Object.entries(LEGACY_PAGE_REDIRECTS)) {
			expect(follow(`https://superset.sh${source}`)).toEqual([
				`https://example.org${destination}`,
			]);
			expect(follow(`https://www.superset.sh/ja${source}`)).toEqual([
				`https://example.org/ja${destination}`,
			]);
		}
		for (const [source, destination] of Object.entries(LEGACY_DOCS_REDIRECTS)) {
			expect(follow(`https://superset.sh${source}`)).toEqual([
				`https://docs.example.org${destination}`,
			]);
		}
	});

	test("leaves API, OAuth, MCP and analytics paths on the legacy hosts", () => {
		expect(follow("https://superset.sh/mcp")).toEqual([
			"https://api.superset.sh/mcp",
		]);
		for (const url of [
			"https://superset.sh/.well-known/mcp",
			"https://superset.sh/.well-known/api-catalog",
			"https://www.superset.sh/api/llms.txt",
			"https://superset.sh/ingest/decide",
			"https://superset.sh/monitoring",
			"https://docs.superset.sh/mcp",
			"https://docs.superset.sh/.well-known/mcp/server-card.json",
			"https://docs.superset.sh/api/search?query=x",
		]) {
			expect(follow(url)).toEqual([]);
		}
		expect(follow("https://superset.sh/mcp-servers")).toEqual([
			"https://example.org/mcp-servers",
		]);
	});

	test("never matches other subdomains", () => {
		for (const host of ["api", "app", "admin"]) {
			const url = `https://${host}.superset.sh/pricing`;
			expect(redirectOnce(url, [...marketing, ...docs])).toBeNull();
		}
	});
});
