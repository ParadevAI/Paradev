import { describe, expect, test } from "bun:test";
import { buildTreeShape } from "../buildTreeShape";
import { expandedDirs, recordExpansion } from "./carryExpansion";

const FULL = [
	"s/billing/components/A.tsx",
	"s/billing/hooks/b.ts",
	"s/billing/plans/page.tsx",
];

describe("carryExpansion", () => {
	test("a closed folder keeps its open subfolders out of the expanded set", () => {
		const shape = buildTreeShape(FULL);
		const known = new Map([["s/billing", false]]);
		expect(expandedDirs(shape, known, true, false)).toEqual(["s"]);
	});

	test("a fold survives the folder turning into a flattened chain and back", () => {
		const full = buildTreeShape(FULL);
		const filtered = buildTreeShape(["s/billing/plans/page.tsx"]);
		const known = new Map<string, boolean>();
		const state = new Map(full.dirs.map((d) => [d, d !== "s/billing"]));
		recordExpansion(full, (d) => state.get(d), known, true);

		const duringSearch = expandedDirs(filtered, known, true, true);
		expect(duringSearch).toContain("s/billing/plans");

		const pierre = new Map(filtered.dirs.map((d) => [d, true]));
		recordExpansion(filtered, (d) => pierre.get(d), known, true);

		expect(expandedDirs(full, known, true, true)).toEqual(["s"]);
	});
});
