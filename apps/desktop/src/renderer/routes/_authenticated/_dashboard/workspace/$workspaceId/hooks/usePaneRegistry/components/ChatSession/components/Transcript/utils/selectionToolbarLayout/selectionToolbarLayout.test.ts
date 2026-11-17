import { describe, expect, test } from "bun:test";
import {
	intersectBoxes,
	selectionToolbarLayout,
} from "./selectionToolbarLayout";

const bounds = { left: 100, top: 50, right: 700, bottom: 650 };
const size = { width: 200, height: 30 };
const line = (left: number, top: number, right: number) => ({
	left,
	top,
	right,
	bottom: top + 20,
});

describe("selectionToolbarLayout", () => {
	test("centres the toolbar 8px above the last selected line", () => {
		expect(
			selectionToolbarLayout({ anchor: line(300, 300, 500), size, bounds }),
		).toEqual({ left: 300, top: 262, placement: "above" });
	});

	test("goes below the line when there is no room above it", () => {
		expect(
			selectionToolbarLayout({ anchor: line(300, 70, 500), size, bounds }),
		).toEqual({ left: 300, top: 98, placement: "below" });
	});

	test("stays 8px inside the pane at either side", () => {
		expect(
			selectionToolbarLayout({ anchor: line(100, 300, 140), size, bounds })
				.left,
		).toBe(108);
		expect(
			selectionToolbarLayout({ anchor: line(660, 300, 700), size, bounds })
				.left,
		).toBe(492);
	});

	test("takes the roomier side and clamps when neither side fits", () => {
		const short = { left: 100, top: 50, right: 700, bottom: 120 };
		expect(
			selectionToolbarLayout({
				anchor: line(300, 60, 500),
				size,
				bounds: short,
			}),
		).toEqual({ left: 300, top: 82, placement: "below" });
	});
});

describe("intersectBoxes", () => {
	test("keeps the overlap of the pane and the window", () => {
		expect(
			intersectBoxes(bounds, { left: 0, top: 0, right: 640, bottom: 600 }),
		).toEqual({ left: 100, top: 50, right: 640, bottom: 600 });
	});
});
