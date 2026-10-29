import { expect, test } from "bun:test";
import { previewScale } from "./previewZoom";

test("fit shrinks a wide page to the frame and leaves a narrow one alone", () => {
	expect(previewScale("fit", 400, 800)).toBe(0.5);
	expect(previewScale("fit", 400, 300)).toBe(1);
	expect(previewScale("fit", 400, null)).toBe(1);
	expect(previewScale(1.5, 400, 800)).toBe(1.5);
});
