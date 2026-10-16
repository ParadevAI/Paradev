import { describe, expect, test } from "bun:test";
import { canvasDiff } from "./canvasDiff";

const content = "# Launch\n\nOwner: Riley\n\n## Risks\n\n1. Pricing page";

describe("canvasDiff", () => {
	test("a replacement compares the section with the new text", () => {
		expect(
			canvasDiff(
				{ change: "replace", before: "Owner: Riley", content },
				"Owner: Avery",
			),
		).toEqual({ before: "Owner: Riley", after: "Owner: Avery" });
	});

	test("an insertion keeps the section it follows", () => {
		expect(
			canvasDiff(
				{ change: "insert_after", before: "Owner: Riley", content },
				"Backup: Avery",
			),
		).toEqual({ before: "Owner: Riley", after: "Owner: Riley\nBackup: Avery" });
	});

	test("an addition at the end follows the canvas's last line", () => {
		expect(
			canvasDiff({ change: "append", before: null, content }, "2. Support"),
		).toEqual({
			before: "1. Pricing page",
			after: "1. Pricing page\n2. Support",
		});
		expect(
			canvasDiff({ change: "append", before: null, content: "" }, "First"),
		).toEqual({ before: "", after: "First" });
	});

	test("a removal keeps the line above it, or the line below at the top", () => {
		expect(
			canvasDiff({ change: "delete", before: "Owner: Riley", content }, ""),
		).toEqual({ before: "# Launch\nOwner: Riley", after: "# Launch" });
		expect(
			canvasDiff({ change: "delete", before: "# Launch", content }, ""),
		).toEqual({ before: "# Launch\nOwner: Riley", after: "Owner: Riley" });
	});
});
