import { describe, expect, test } from "bun:test";
import { maskRecordedText } from "./posthog-privacy";

function elementInside(unmasked: boolean): HTMLElement {
	return {
		closest: (selector: string) =>
			unmasked && selector === "[data-ph-unmask]" ? {} : null,
	} as unknown as HTMLElement;
}

describe("maskRecordedText", () => {
	test("masks text outside unmasked chrome", () => {
		expect(maskRecordedText("fix login bug", elementInside(false))).toBe(
			"*** ***** ***",
		);
	});

	test("masks text with no element", () => {
		expect(maskRecordedText("secret")).toBe("******");
	});

	test("keeps text inside unmasked chrome", () => {
		expect(maskRecordedText("Settings", elementInside(true))).toBe("Settings");
	});
});
