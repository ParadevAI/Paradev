import { expect, test } from "bun:test";
import { svgSize } from "./svgSize";

test("reads the drawing's size from its viewBox and falls back without one", () => {
	expect(svgSize('<svg viewBox="-8 -8 512.5 240" width="100%"></svg>')).toEqual(
		{ width: 512.5, height: 240 },
	);
	expect(svgSize("<svg></svg>")).toEqual({ width: 800, height: 600 });
});
