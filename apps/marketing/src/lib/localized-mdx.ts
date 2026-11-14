import fs from "node:fs";
import path from "node:path";
import {
	isSupportedLocale,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import { slugify } from "./blog-utils";
import { markdownHeadings, stripInlineMarkdown } from "./content-utils";

export type MdxFamily = "compare" | "category" | "blog" | "changelog" | "legal";
const CATEGORY_SLUGS = new Set([
	"agent-orchestration",
	"multiplayer-coding-agents",
	"parallel-coding-agents",
]);
const LEGAL_SLUGS = new Set(["privacy", "security", "subprocessors", "terms"]);

export function articleSource(
	pathname: string,
): { family: MdxFamily; slug: string } | undefined {
	const match = /^\/(compare|blog|changelog)\/([^/]+)$/.exec(pathname);
	if (match?.[1] && match[2])
		return { family: match[1] as MdxFamily, slug: match[2] };
	const slug = pathname.slice(1);
	if (CATEGORY_SLUGS.has(slug)) return { family: "category", slug };
	if (LEGAL_SLUGS.has(slug)) return { family: "legal", slug };
}

export function localizedMdxFile(
	family: MdxFamily,
	slug: string,
	locale: SupportedLocale = "en",
): string {
	const source = path.join(process.cwd(), "content", family, `${slug}.mdx`);
	if (locale === "en") return source;
	const translated = path.join(
		process.cwd(),
		"content/localized",
		locale,
		family,
		`${slug}.mdx`,
	);
	return fs.existsSync(translated) ? translated : source;
}

export function availableArticleLocales(
	pathname: string,
	exists: (file: string) => boolean = fs.existsSync,
): readonly SupportedLocale[] | undefined {
	const source = articleSource(pathname);
	if (!source) return undefined;
	return SUPPORTED_LOCALES.filter(
		(locale) =>
			locale === "en" ||
			exists(
				path.join(
					process.cwd(),
					"content/localized",
					locale,
					source.family,
					`${source.slug}.mdx`,
				),
			),
	);
}

function headings(content: string, locale = "en") {
	return markdownHeadings(content).map((heading) => ({
		...heading,
		id: slugify(stripInlineMarkdown(heading.text), locale),
	}));
}

export function preserveSourceHeadingAnchors(
	english: string,
	translated: string,
	locale = "und",
): string {
	const original = headings(english);
	const local = headings(translated, locale);
	if (
		original.length !== local.length ||
		original.some((heading, index) => heading.level !== local[index]?.level)
	)
		throw new Error(
			"Localized article heading structure differs from its English source",
		);
	const sourceIds = new Map(
		local.map((heading, index) => [heading.line, original[index]?.id]),
	);
	const ids = new Set(local.map((heading) => heading.id));
	return translated
		.split("\n")
		.map((line, index) => {
			const id = sourceIds.get(index);
			if (!id || ids.has(id)) return line;
			ids.add(id);
			return `<span id="${id.replace(/"/g, "&quot;")}" />\n\n${line}`;
		})
		.join("\n");
}

export function localizedArticleBody(
	family: MdxFamily,
	slug: string,
	locale: SupportedLocale,
	body: string,
): string {
	if (
		locale === "en" ||
		localizedMdxFile(family, slug, locale) === localizedMdxFile(family, slug)
	)
		return body;
	const raw = fs.readFileSync(localizedMdxFile(family, slug), "utf8");
	const englishBody = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
	return preserveSourceHeadingAnchors(englishBody, body, locale);
}

export function localizeMdxHref(
	locale: SupportedLocale,
	href: string | undefined,
): string | undefined {
	if (!href || locale === "en" || href.startsWith("//")) return href;
	let local = href;
	if (/^https?:\/\//.test(href)) {
		const url = new URL(href);
		if (url.origin !== new URL(COMPANY.MARKETING_URL).origin) return href;
		local = `${url.pathname}${url.search}${url.hash}`;
	}
	if (!local.startsWith("/")) return href;
	const pathname = local.split(/[?#]/)[0] ?? "/";
	const first = pathname.split("/")[1];
	if (
		(first && isSupportedLocale(first)) ||
		/\.[a-z0-9]+$/i.test(pathname) ||
		/^\/(api|_next|_vercel|images|videos|fonts|assets)(\/|$)/.test(pathname)
	)
		return href;
	return `/${locale}${pathname === "/" ? local.slice(1) : local}`;
}

export function localizeMarkdownLinks(
	content: string,
	locale: SupportedLocale = "en",
): string {
	if (locale === "en") return content;
	return content.replace(
		/(```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`]*?`+)|(!?\[[^\]\n]+\]\()([^\s)]+)(\))/g,
		(_match, code, opening, href, closing) =>
			code ?? `${opening}${localizeMdxHref(locale, href)}${closing}`,
	);
}
