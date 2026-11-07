import { describe, expect, test } from "bun:test";
import {
	darwinVersionFor,
	withMinimumSystemVersion,
} from "./gate-mac-update-manifest";

describe("darwinVersionFor", () => {
	test("maps macOS 11-15 to Darwin 20-24", () => {
		expect(darwinVersionFor("12.0")).toBe("21.0.0");
		expect(darwinVersionFor("13.0")).toBe("22.0.0");
		expect(darwinVersionFor("15.4")).toBe("24.0.0");
	});

	test("maps macOS 26 to Darwin 25", () => {
		expect(darwinVersionFor("26.0")).toBe("25.0.0");
	});

	test("rejects a version it cannot map", () => {
		expect(() => darwinVersionFor("10.15")).toThrow();
		expect(() => darwinVersionFor("")).toThrow();
	});
});

describe("withMinimumSystemVersion", () => {
	const manifest = `version: 1.40.0
files:
  - url: Superset-arm64-mac.zip
    sha512: abc
    size: 10
path: Superset-arm64-mac.zip
sha512: abc
releaseDate: '2026-10-23T00:00:00.000Z'
`;

	test("appends the key after the existing fields", () => {
		expect(withMinimumSystemVersion(manifest, "22.0.0")).toBe(
			`${manifest}minimumSystemVersion: '22.0.0'\n`,
		);
	});

	test("replaces an existing value instead of adding a second key", () => {
		const once = withMinimumSystemVersion(manifest, "21.0.0");
		expect(withMinimumSystemVersion(once, "22.0.0")).toBe(
			`${manifest}minimumSystemVersion: '22.0.0'\n`,
		);
	});
});
