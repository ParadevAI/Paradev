import { describe, expect, it } from "bun:test";
import { galleryLayout, maxVisibleImages } from "./galleryLayout";

describe("galleryLayout", () => {
	it("caps a wide screenshot at Slack's landscape height and keeps its shape", () => {
		const [size] = galleryLayout(800, [{ width: 3840, height: 2160 }]);
		expect(size?.height).toBe(235);
		expect(size?.width).toBe(Math.floor(235 * (3840 / 2160)));
	});

	it("never upscales a small image, and keeps it at least 108px", () => {
		expect(galleryLayout(800, [{ width: 200, height: 150 }])).toEqual([
			{ width: 200, height: 150 },
		]);
		expect(galleryLayout(800, [{ width: 40, height: 40 }])).toEqual([
			{ width: 108, height: 108 },
		]);
	});

	it("gives two images one row height", () => {
		const sizes = galleryLayout(800, [
			{ width: 1600, height: 900 },
			{ width: 900, height: 1600 },
		]);
		expect(sizes[0]?.height).toBe(sizes[1]?.height);
		expect((sizes[0]?.width ?? 0) + (sizes[1]?.width ?? 0)).toBeLessThanOrEqual(
			800 - 8,
		);
	});

	it("tiles three or more within the width, folding the rest", () => {
		const naturals = Array.from({ length: 6 }, () => ({
			width: 1200,
			height: 900,
		}));
		const sizes = galleryLayout(500, naturals);
		expect(sizes).toHaveLength(maxVisibleImages(500));
		const total = sizes.reduce((sum, size) => sum + size.width, 0);
		expect(total + (sizes.length - 1) * 8).toBeLessThanOrEqual(500);
	});
});
