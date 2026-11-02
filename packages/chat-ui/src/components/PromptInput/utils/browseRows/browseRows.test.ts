import { describe, expect, mock, test } from "bun:test";
import type { ComposerMentionProvider } from "../../types";
import { browseRows } from "./browseRows";

const provider = (
	id: string,
	priority: number,
	browse?: ComposerMentionProvider["browse"],
): ComposerMentionProvider => ({
	id,
	title: id,
	priority,
	...(browse ? { browse } : {}),
	source: { kind: "static", load: () => [] },
});

describe("browseRows", () => {
	test("only browsable providers get a row, in priority order", () => {
		const { rows, browsed } = browseRows(
			[
				provider("prs", 5, { label: "Pull requests", placeholder: "Search…" }),
				provider("files", 1),
				provider("linear", 3, { label: "Linear issues", placeholder: "…" }),
			],
			() => {},
		);
		expect(rows.map((row) => row.label)).toEqual([
			"Linear issues",
			"Pull requests",
		]);
		expect(rows.every((row) => row.opensSubmenu)).toBe(true);
		expect([...browsed].sort()).toEqual(["linear", "prs"]);
	});

	test("selecting a row opens that provider", () => {
		const open = mock((_provider: ComposerMentionProvider) => {});
		const linear = provider("linear", 3, { label: "Linear", placeholder: "…" });
		const [row] = browseRows([linear], open).rows;
		void row?.select({
			insertChip: () => {},
			attachFiles: () => {},
			openPanel: () => {},
			query: "",
		});
		expect(open).toHaveBeenCalledWith(linear);
	});
});
