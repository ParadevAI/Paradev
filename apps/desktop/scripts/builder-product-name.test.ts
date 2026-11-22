import { describe, expect, test } from "bun:test";
import { builderProductName, targetPlatforms } from "./builder-product-name";

const names = { productName: "Paradev", legacyProductName: "Superset" };

describe("targetPlatforms", () => {
	test("builds the host platform when no platform flag is given", () => {
		expect([...targetPlatforms(["--config", "x.ts"], "linux")]).toEqual([
			"linux",
		]);
		expect([...targetPlatforms(["--x64"], "darwin")]).toEqual(["mac"]);
	});

	test("reads long, short and combined platform flags", () => {
		expect([...targetPlatforms(["--linux", "deb"], "darwin")]).toEqual([
			"linux",
		]);
		expect([...targetPlatforms(["-ml"], "linux")].sort()).toEqual([
			"linux",
			"mac",
		]);
		expect([...targetPlatforms(["--win=nsis"], "linux")]).toEqual(["win"]);
		expect([...targetPlatforms(["-c", "x.ts"], "darwin")]).toEqual(["mac"]);
	});
});

describe("builderProductName", () => {
	test("keeps the legacy name for a Linux-only build", () => {
		expect(
			builderProductName({ ...names, argv: [], hostPlatform: "linux" }),
		).toBe("Superset");
		expect(
			builderProductName({ ...names, argv: ["-l"], hostPlatform: "darwin" }),
		).toBe("Superset");
	});

	test("uses the product name for macOS and Windows builds", () => {
		expect(
			builderProductName({ ...names, argv: [], hostPlatform: "darwin" }),
		).toBe("Paradev");
		expect(
			builderProductName({ ...names, argv: ["--win"], hostPlatform: "linux" }),
		).toBe("Paradev");
	});

	test("refuses a run that mixes Linux with another platform", () => {
		expect(() =>
			builderProductName({
				...names,
				argv: ["--mac", "--linux"],
				hostPlatform: "darwin",
			}),
		).toThrow("Build Linux in its own electron-builder run");
	});
});
