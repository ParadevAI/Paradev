import fs from "node:fs";
import path from "node:path";
import type { SupportedLocale } from "@superset/i18n";
import matter from "gray-matter";
import { slugify, type TocItem } from "./blog-utils";
import type { ComparisonPage } from "./compare-utils";
import {
	markdownHeadings,
	normalizeContentDate,
	stripInlineMarkdown,
} from "./content-utils";
import { localizedArticleBody, localizedMdxFile } from "./localized-mdx";

export { type ComparisonPage, formatCompareDate } from "./compare-utils";

const COMPARE_DIR = path.join(process.cwd(), "content/compare");

function parseFrontmatter(
	filePath: string,
	locale: SupportedLocale = "en",
): ComparisonPage | null {
	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(fileContent);

		const slug = path.basename(filePath, ".mdx");
		const dateValue = normalizeContentDate(data.date) as string;
		const lastUpdated = normalizeContentDate(data.lastUpdated, {
			fallbackToNow: false,
		});

		return {
			slug,
			url: `/compare/${slug}`,
			title: data.title ?? "Untitled",
			description: data.description ?? "",
			date: dateValue,
			lastUpdated,
			type: data.type ?? "1v1",
			competitors: data.competitors ?? [],
			keywords: data.keywords ?? [],
			image: data.image,
			content: localizedArticleBody("compare", slug, locale, content),
		};
	} catch {
		return null;
	}
}

export function getComparisonPages(
	locale: SupportedLocale = "en",
): ComparisonPage[] {
	if (!fs.existsSync(COMPARE_DIR)) {
		return [];
	}

	const files = fs.readdirSync(COMPARE_DIR).filter((f) => f.endsWith(".mdx"));

	const pages = files
		.map((file) =>
			parseFrontmatter(
				localizedMdxFile("compare", path.basename(file, ".mdx"), locale),
				locale,
			),
		)
		.filter((page): page is ComparisonPage => page !== null);

	return pages.sort((a, b) => {
		const dateA = new Date(a.date);
		const dateB = new Date(b.date);
		return dateB.getTime() - dateA.getTime();
	});
}

export function getComparisonPage(
	slug: string,
	locale: SupportedLocale = "en",
): ComparisonPage | undefined {
	const filePath = localizedMdxFile("compare", slug, locale);

	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	return parseFrontmatter(filePath, locale) ?? undefined;
}

export function extractCompareToc(
	content: string,
	locale: SupportedLocale = "en",
): TocItem[] {
	return markdownHeadings(content)
		.filter((heading) => heading.level === 2 || heading.level === 3)
		.map((heading) => {
			const text = stripInlineMarkdown(heading.text);
			return { id: slugify(text, locale), text, level: heading.level };
		});
}
