import { describe, expect, test } from "bun:test";
import { APPLY_HEADLINE_VARIANT_SCRIPT } from "./hero-headline";

function applyScript(cookie: string, consent: string | null = null) {
	const dataset: Record<string, string> = {};
	new Function("document", "localStorage", APPLY_HEADLINE_VARIANT_SCRIPT)(
		{ cookie, documentElement: { dataset } },
		{ getItem: () => consent },
	);
	return dataset.heroHeadline;
}

describe("head script", () => {
	test("applies an assigned variant", () => {
		expect(applyScript("a=1; superset_hero_headline=army")).toBe("army");
	});

	test("ignores unknown values, so a stale cookie cannot hide every arm", () => {
		expect(applyScript("superset_hero_headline=bogus")).toBeUndefined();
		expect(applyScript("superset_hero_headline=ideX")).toBeUndefined();
	});

	test("visitors who declined analytics see control", () => {
		expect(
			applyScript("superset_hero_headline=ide", "declined"),
		).toBeUndefined();
	});
});
