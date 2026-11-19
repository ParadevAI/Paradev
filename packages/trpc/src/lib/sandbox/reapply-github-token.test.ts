import { describe, expect, test } from "bun:test";
import type { cloudWorkspaces } from "@superset/db/schema";
import { reapplyRulesOnBoxes } from "./reapply-github-token";

type Box = typeof cloudWorkspaces.$inferSelect;
const box = (id: string) => ({ id, organizationId: "org-1" }) as Box;

describe("reapplyRulesOnBoxes", () => {
	test("a rotation re-applies the rules on every awake box of the person", async () => {
		const applied: string[] = [];
		const outcome = await reapplyRulesOnBoxes({
			boxes: [box("a"), box("b"), box("c")],
			deadline: Date.now() + 60_000,
			apply: async (row) => {
				applied.push(row.id);
				return "applied";
			},
		});
		expect(applied).toEqual(["a", "b", "c"]);
		expect(outcome).toEqual({ applied: 3, failed: 0, left: 0 });
	});

	test("a failure on one box does not stop the rest", async () => {
		const applied: string[] = [];
		const outcome = await reapplyRulesOnBoxes({
			boxes: [box("a"), box("b"), box("c")],
			deadline: Date.now() + 60_000,
			apply: async (row) => {
				if (row.id === "b") throw new Error("sandbox API down");
				applied.push(row.id);
				return "applied";
			},
		});
		expect(applied).toEqual(["a", "c"]);
		expect(outcome).toEqual({ applied: 2, failed: 1, left: 0 });
	});
});
