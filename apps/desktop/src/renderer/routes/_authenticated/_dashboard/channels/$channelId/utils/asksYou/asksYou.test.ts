import { describe, expect, test } from "bun:test";
import { asksYou } from "./asksYou";

describe("asksYou", () => {
	test("a reply that ends on a question asks", () => {
		expect(asksYou("The tabs PR is up.\n\nMerge it now?")).toBe(true);
	});

	test("a numbered choice asks", () => {
		expect(
			asksYou(
				"Which do you want?\n1. **Keep it.** Stays open.\n2. **Archive it.** Gone.",
			),
		).toBe(true);
	});

	test("a question followed by its reasoning still asks", () => {
		expect(
			asksYou("Checks passed.\n\nMerge it now? I'd wait for review."),
		).toBe(true);
	});

	test("a report does not", () => {
		expect(asksYou("Done. Three files changed, checks passed.")).toBe(false);
	});

	test("a question answered earlier in the reply does not", () => {
		expect(asksYou("Did it pass? Yes.\n\nAll three files are in.")).toBe(false);
	});
});
