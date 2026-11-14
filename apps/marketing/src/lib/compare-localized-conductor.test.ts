import { expect, test } from "bun:test";
import { SUPPORTED_LOCALES } from "@superset/i18n";
import { extractCompareToc, getComparisonPage } from "./compare";
import { extractComparisonFaqItems, splitComparisonFaq } from "./compare-utils";
import {
	localizedMdxFile,
	localizeMarkdownLinks,
	localizeMdxHref,
} from "./localized-mdx";

test("Conductor comparison loads its existing locales and compatible FAQ anchors", () => {
	for (const locale of SUPPORTED_LOCALES) {
		const page = getComparisonPage("superset-vs-conductor", locale);
		expect(page).toBeDefined();
		expect(extractComparisonFaqItems(page?.content ?? "")).toHaveLength(3);
		expect(
			extractCompareToc(page?.content ?? "", locale).length,
		).toBeGreaterThan(3);
		if (locale !== "en") {
			expect(page?.content).toContain('id="frequently-asked-questions"');
			const split = splitComparisonFaq(page?.content ?? "");
			expect(split.body).not.toContain('id="frequently-asked-questions"');
			expect(split.faq).toStartWith('<span id="frequently-asked-questions" />');
			expect(localizeMarkdownLinks(page?.content ?? "", locale)).toContain(
				`](/${locale}/conductor)`,
			);
		}
	}
});

test("focused comparison localization leaves absent article translations in English", () => {
	expect(localizedMdxFile("compare", "superset-vs-cursor", "ja")).toBe(
		localizedMdxFile("compare", "superset-vs-cursor", "en"),
	);
	expect(getComparisonPage("superset-vs-cursor", "ja")?.content).toBe(
		getComparisonPage("superset-vs-cursor", "en")?.content,
	);
	expect(localizeMdxHref("ja", "/conductor#migrate")).toBe(
		"/ja/conductor#migrate",
	);
	expect(
		localizeMdxHref("ja", "https://docs.paradev.com/migrate-from-conductor"),
	).toBe("https://docs.paradev.com/migrate-from-conductor");
});

test("localized Markdown links preserve code, external URLs, locale prefixes and assets", () => {
	const content = [
		"[Pricing](/pricing#plans) [Local](/ja/conductor) ![Image](/images/demo.png)",
		"[Docs](https://docs.paradev.com/migrate-from-conductor)",
		"`[Code](/pricing)`",
		"```md\n[Example](/conductor)\n```",
	].join("\n");
	expect(localizeMarkdownLinks(content, "en")).toBe(content);
	expect(localizeMarkdownLinks(content, "ja")).toBe(
		content.replace(
			"[Pricing](/pricing#plans)",
			"[Pricing](/ja/pricing#plans)",
		),
	);
});
