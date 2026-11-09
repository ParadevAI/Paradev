import { describe, expect, test } from "bun:test";
import { buildTreeShape } from "../buildTreeShape";
import { planExpansion, recordExpansion } from "./carryExpansion";

const FULL = [
	"s/billing/components/A.tsx",
	"s/billing/hooks/b.ts",
	"s/billing/plans/page.tsx",
];

describe("carryExpansion", () => {
	test("a closed folder is collapsed while its subfolders stay open", () => {
		const shape = buildTreeShape(FULL);
		const known = new Map([["s/billing", false]]);
		expect(planExpansion(shape, known, true, false)).toEqual({
			expand: [
				"s",
				"s/billing/components",
				"s/billing/hooks",
				"s/billing/plans",
			],
			collapse: ["s/billing"],
		});
	});

	test("a fold survives the folder turning into a flattened chain and back", () => {
		const full = buildTreeShape(FULL);
		const filtered = buildTreeShape(["s/billing/plans/page.tsx"]);
		const known = new Map<string, boolean>();
		const state = new Map(full.dirs.map((d) => [d, d !== "s/billing"]));
		recordExpansion(full, (d) => state.get(d), known, true);

		const duringSearch = planExpansion(filtered, known, true, true);
		expect(duringSearch.expand).toContain("s/billing/plans");
		expect(duringSearch.collapse).toEqual([]);

		const pierre = new Map(filtered.dirs.map((d) => [d, true]));
		recordExpansion(filtered, (d) => pierre.get(d), known, true);

		expect(planExpansion(full, known, true, true).collapse).toEqual([
			"s/billing",
		]);
	});
});
