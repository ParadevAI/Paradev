import { describe, expect, test } from "bun:test";
import {
	DEV_COLORS,
	markToneFor,
	nextColor,
	shuffleColor,
} from "./dev-color.ts";

describe("markToneFor", () => {
	test("light tiles get the ink mark, dark tiles the paper mark", () => {
		expect(markToneFor("#F2B23E")).toBe("ink");
		expect(markToneFor("#FBE3B0")).toBe("ink");
		expect(markToneFor("#FFFFFF")).toBe("ink");
		expect(markToneFor("#8A4B2A")).toBe("paper");
		expect(markToneFor("#3E5C3A")).toBe("paper");
		expect(markToneFor("#000000")).toBe("paper");
	});

	test("every palette colour keeps the mark readable (contrast ≥ 3:1, WCAG for graphics)", () => {
		const lum = (hex: string) => {
			const [r, g, b] = [1, 3, 5].map((i) => {
				const c = parseInt(hex.slice(i, i + 2), 16) / 255;
				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
		};
		for (const color of DEV_COLORS) {
			const mark = markToneFor(color) === "ink" ? "#17120F" : "#F5EFE4";
			const [hi, lo] = [lum(color), lum(mark)].sort((a, b) => b - a);
			expect((hi! + 0.05) / (lo! + 0.05)).toBeGreaterThanOrEqual(3);
		}
	});
});

test("the cycle visits every palette colour and wraps around", () => {
	const seen = [DEV_COLORS[0] as string];
	for (let i = 1; i < DEV_COLORS.length; i++)
		seen.push(nextColor(seen.at(-1)!));
	expect(seen).toEqual([...DEV_COLORS]);
	expect(nextColor(DEV_COLORS.at(-1)!)).toBe(DEV_COLORS[0]);
	// A colour that isn't in the palette (e.g. from an older client) restarts the cycle.
	expect(nextColor("#123456")).toBe(DEV_COLORS[0]);
});

test("shuffle never returns the current colour", () => {
	for (let i = 0; i < 50; i++)
		expect(shuffleColor("#F2B23E")).not.toBe("#F2B23E");
	expect(DEV_COLORS).toContain(
		shuffleColor("#F2B23E", () => 0.999) as (typeof DEV_COLORS)[number],
	);
});
