import { describe, expect, it } from "bun:test";
import { toAppDisplayName } from "./app-display-name";

describe("toAppDisplayName", () => {
	it("keeps every app name unchanged with the default display name", () => {
		for (const name of [
			"Superset",
			"Superset Canary",
			"Superset (my-branch)",
		]) {
			expect(toAppDisplayName(name, "Superset")).toBe(name);
		}
	});

	it("swaps only the product name and keeps the suffix", () => {
		expect(toAppDisplayName("Superset", "Paradev")).toBe("Paradev");
		expect(toAppDisplayName("Superset Canary", "Paradev")).toBe(
			"Paradev Canary",
		);
		expect(toAppDisplayName("Superset (my-branch)", "Paradev")).toBe(
			"Paradev (my-branch)",
		);
	});

	it("leaves a name without the product name alone", () => {
		expect(toAppDisplayName("Electron", "Paradev")).toBe("Electron");
	});
});
