import { describe, expect, it } from "bun:test";
import { shouldUseLegacyAppProfile } from "./legacy-app-profile";

const existing =
	(...paths: string[]) =>
	(path: string) =>
		paths.includes(path);

describe("shouldUseLegacyAppProfile", () => {
	it("keeps the old profile when only it exists", () => {
		expect(
			shouldUseLegacyAppProfile("/data", "Paradev", existing("/data/Superset")),
		).toBe(true);
	});

	it("uses the new profile on a fresh install", () => {
		expect(shouldUseLegacyAppProfile("/data", "Paradev", existing())).toBe(
			false,
		);
	});

	it("uses the new profile once it exists", () => {
		expect(
			shouldUseLegacyAppProfile(
				"/data",
				"Paradev",
				existing("/data/Superset", "/data/Paradev"),
			),
		).toBe(false);
	});

	it("does nothing when the app is already named Superset", () => {
		expect(
			shouldUseLegacyAppProfile(
				"/data",
				"Superset",
				existing("/data/Superset"),
			),
		).toBe(false);
	});
});
