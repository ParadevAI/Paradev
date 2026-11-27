import { afterEach, describe, expect, test } from "bun:test";
import { canTrack, mayTrack, readConsentCountry } from "./consent";
import { consentRegionForCountry } from "./consent-region";

const globals = globalThis as { window?: unknown };

afterEach(() => {
	delete globals.window;
});

function visit(region: string | null, choice: string | null) {
	globals.window = {
		document: {
			cookie: region ? `other=1; paradev-consent-region=${region}` : "",
		},
		localStorage: { getItem: () => choice },
	};
	return canTrack();
}

describe("canTrack", () => {
	test("opt-in region tracks only after Accept", () => {
		expect(visit("opt-in", null)).toBe(false);
		expect(visit("opt-in", "declined")).toBe(false);
		expect(visit("opt-in", "accepted")).toBe(true);
	});

	test("other regions track unless declined", () => {
		expect(visit("opt-out", null)).toBe(true);
		expect(visit("opt-out", "accepted")).toBe(true);
		expect(visit("opt-out", "declined")).toBe(false);
	});

	test("a missing region counts as opt-in", () => {
		expect(visit(null, null)).toBe(false);
		expect(visit(null, "accepted")).toBe(true);
	});

	test("an unreadable choice means no tracking", () => {
		const warn = console.warn;
		console.warn = () => {};
		globals.window = {
			document: { cookie: "paradev-consent-region=opt-out" },
			localStorage: {
				getItem: () => {
					throw new Error("storage blocked");
				},
			},
		};
		try {
			expect(canTrack()).toBe(false);
		} finally {
			console.warn = warn;
		}
	});

	test("ignores unknown stored values", () => {
		expect(mayTrack("opt-in", null)).toBe(false);
		expect(visit("opt-in", "yes")).toBe(false);
	});
});

test("reads the region and country from old and new cookie values", () => {
	const read = (value: string) => {
		globals.window = {
			document: { cookie: `paradev-consent-region=${value}` },
		};
		return [canTrack(), readConsentCountry()];
	};
	expect(read("opt-out")).toEqual([true, null]);
	expect(read("opt-out.US")).toEqual([true, "US"]);
	expect(read("opt-in.DE")).toEqual([false, "DE"]);
	expect(read("opt-out.us")).toEqual([true, null]);
	expect(read("opt-out.USA")).toEqual([true, null]);
});

describe("consentRegionForCountry", () => {
	test("EU, EEA and UK are opt-in; Switzerland and others are opt-out", () => {
		for (const country of ["FR", "IE", "NO", "IS", "LI", "GB"]) {
			expect(consentRegionForCountry(country, { production: true })).toBe(
				"opt-in",
			);
		}
		for (const country of ["CH", "US", "JP", "BR"]) {
			expect(consentRegionForCountry(country, { production: true })).toBe(
				"opt-out",
			);
		}
	});

	test("an unknown country is opt-in in production only", () => {
		expect(consentRegionForCountry(null, { production: true })).toBe("opt-in");
		expect(consentRegionForCountry(null, { production: false })).toBe(
			"opt-out",
		);
	});
});
