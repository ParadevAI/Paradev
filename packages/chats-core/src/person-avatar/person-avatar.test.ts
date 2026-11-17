import { describe, expect, test } from "bun:test";
import { PERSON_COLORS, personColor, personInitials } from "./person-avatar.ts";

describe("personColor", () => {
	test("is stable for a name, ignoring case and surrounding space", () => {
		expect(personColor("Nina")).toBe(personColor(" nina "));
		expect(PERSON_COLORS).toContain(
			personColor("plkkota") as (typeof PERSON_COLORS)[number],
		);
	});

	test("spreads names over the palette", () => {
		const names = [
			"Nina",
			"Leo",
			"plkkota",
			"harshithmullapudi",
			"Maya",
			"Sam",
			"Ava",
			"Omar",
		];
		expect(new Set(names.map(personColor)).size).toBeGreaterThan(3);
	});
});

describe("personInitials", () => {
	test("takes the first two words' first letters", () => {
		expect(personInitials("nina park")).toBe("NP");
		expect(personInitials("Ana María López")).toBe("AM");
	});

	test("takes one letter for one word, and a placeholder for none", () => {
		expect(personInitials("plkkota")).toBe("P");
		expect(personInitials("  ")).toBe("?");
	});
});
