import { describe, expect, test } from "bun:test";
import { ambiguityHint } from "./ambiguity-hint.ts";

describe("ambiguityHint", () => {
	test("names the shared names, or says nothing", () => {
		expect(ambiguityHint([])).toBeNull();
		expect(ambiguityHint(["Juniper"])).toBe(
			"Several Devs are called Juniper — pick one",
		);
		expect(ambiguityHint(["Juniper", "Pip", "Goa"])).toBe(
			"Several Devs are called Juniper, Pip or Goa — pick one",
		);
	});
});
