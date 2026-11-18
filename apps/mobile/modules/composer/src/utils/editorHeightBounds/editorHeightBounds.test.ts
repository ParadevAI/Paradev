import { describe, expect, test } from "bun:test";
import { editorHeightBounds } from "./editorHeightBounds";

const metrics = { lineHeight: 22, minLines: 4, maxLines: 10 };

describe("editorHeightBounds", () => {
	test("keeps the preferred lines before the room is measured", () => {
		expect(editorHeightBounds({ ...metrics, room: null })).toEqual({
			minHeight: 88,
			maxHeight: 220,
		});
	});

	test("keeps the preferred lines when they fit", () => {
		expect(editorHeightBounds({ ...metrics, room: 400 })).toEqual({
			minHeight: 88,
			maxHeight: 220,
		});
	});

	test("shrinks to the room on a short screen", () => {
		expect(editorHeightBounds({ ...metrics, room: 60 })).toEqual({
			minHeight: 60,
			maxHeight: 60,
		});
	});

	test("never goes below one line", () => {
		expect(editorHeightBounds({ ...metrics, room: -40 })).toEqual({
			minHeight: 22,
			maxHeight: 22,
		});
	});
});
