import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CloudGlyph } from "./CloudGlyph";

afterEach(cleanup);

test("only a connecting cloud draws the travelling arc over a dimmed outline", () => {
	const on = render(<CloudGlyph />).container;
	expect(on.querySelectorAll("path")).toHaveLength(1);
	expect(on.querySelector(".cloud-glyph-outline")?.classList).not.toContain(
		"opacity-35",
	);
	cleanup();

	const connecting = render(<CloudGlyph state="connecting" />).container;
	expect(connecting.querySelector(".cloud-glyph-arc")).not.toBeNull();
	expect(connecting.querySelector(".cloud-glyph-outline")?.classList).toContain(
		"opacity-35",
	);
});
