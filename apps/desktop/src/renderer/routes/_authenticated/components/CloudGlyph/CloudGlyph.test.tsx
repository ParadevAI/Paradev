import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CloudGlyph } from "./CloudGlyph";

afterEach(cleanup);

test("only a connecting cloud draws the travelling arc; an asleep one is a dashed outline", () => {
	const on = render(<CloudGlyph />).container;
	expect(on.querySelectorAll("path")).toHaveLength(1);
	expect(on.querySelector(".cloud-glyph-outline")?.classList).not.toContain(
		"opacity-35",
	);
	cleanup();

	const asleep = render(<CloudGlyph state="asleep" />).container;
	expect(asleep.querySelectorAll("path")).toHaveLength(1);
	expect(asleep.querySelector(".cloud-glyph-outline")?.classList).toContain(
		"cloud-glyph-asleep",
	);
	cleanup();

	const connecting = render(<CloudGlyph state="connecting" />).container;
	expect(connecting.querySelector(".cloud-glyph-arc")).not.toBeNull();
	expect(connecting.querySelector(".cloud-glyph-outline")?.classList).toContain(
		"opacity-35",
	);
});
