import { expect, test } from "bun:test";
import { SUPPORTED_LOCALES } from "@superset/i18n";
import { extractCompareToc, getComparisonPage } from "./compare";
import { extractComparisonFaqItems } from "./compare-utils";
import { localizedMdxFile, localizeMdxHref } from "./localized-mdx";

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
