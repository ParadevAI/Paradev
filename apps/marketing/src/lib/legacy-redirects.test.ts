import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
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
