import { expect, test } from "bun:test";
import { markdownText } from "./markdownText";

test("keeps Markdown block boundaries while retaining inline text and code", () => {
	expect(
		markdownText(
			"# Heading\n\n- **First** item\n- `second` item\n\n```ts\nconst n = 1;\n```",
		),
	).toBe("Heading\nFirst item\nsecond item\nconst n = 1;");
});
