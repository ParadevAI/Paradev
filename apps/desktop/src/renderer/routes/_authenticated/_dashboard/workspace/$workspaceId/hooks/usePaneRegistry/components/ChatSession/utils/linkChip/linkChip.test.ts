import { describe, expect, test } from "bun:test";
import { linkChip, linkOfChip } from "./linkChip";

const options = { webUrl: "https://app.superset.sh", isDark: true };
const label = (text: string) => linkChip(text, options)?.label;

describe("linkChip", () => {
	test("names links the way a reader would", () => {
		expect(label("https://github.com/acme/widgets/pull/42")).toBe(
			"acme/widgets#42",
		);
		expect(label("https://github.com/acme/widgets")).toBe("acme/widgets");
		expect(label("https://github.com/acme/widgets/blob/main/src/auth.ts")).toBe(
			"auth.ts",
		);
		expect(label("https://linear.app/acme/issue/ABC-12/fix-login")).toBe(
			"ABC-12",
		);
		expect(
			label(
				"https://www.notion.so/acme/Launch-Plan-Q4-0123456789abcdef0123456789abcdef",
			),
		).toBe("Launch Plan Q4");
		expect(
			label("https://www.figma.com/design/AbC123/Checkout-Flow?node-id=1-2"),
		).toBe("Checkout Flow");
		expect(label("https://example.com/docs/start")).toBe(
			"https://example.com/docs/start",
		);
	});

	test("sends the URL itself and remembers it is a link", () => {
		const url = "https://example.com/docs";
		const chip = linkChip(url, options);
		expect(chip?.serialized).toBe(url);
		expect(chip && linkOfChip(chip)).toBe(url);
		expect(chip?.iconUrl).toStartWith("data:image/svg+xml,");
	});

	test("leaves anything that is not one plain web link as text", () => {
		expect(linkChip("see https://example.com", options)).toBeNull();
		expect(linkChip("ftp://example.com/file", options)).toBeNull();
		expect(linkChip("https://user:secret@example.com/", options)).toBeNull();
		expect(linkChip("not a link", options)).toBeNull();
	});
});
