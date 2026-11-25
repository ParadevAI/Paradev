import { describe, expect, test } from "bun:test";
import type { cloudWorkspaces } from "@superset/db/schema";
import { reapplyRulesOnBoxes, rulesRefreshAt } from "./reapply-rules";

type Box = typeof cloudWorkspaces.$inferSelect;
const box = (id: string) => ({ id, organizationId: "org-1" }) as Box;
const MINUTE = 60_000;

describe("reapplyRulesOnBoxes", () => {
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

describe("rulesRefreshAt", () => {
	test("two chains of refreshes of one box merge into one, each ahead of its token's expiry", () => {
		const start = Date.UTC(2026, 10, 19, 12, 7);
		const end = start + 4 * 60 * MINUTE;
		const queued = new Set<number>();
		const due = [start, start + 20 * MINUTE];
		let runs = 0;
		for (let ranAt = due.shift(); ranAt; ranAt = due.shift()) {
			runs++;
			const expiresAt = ranAt + 60 * MINUTE;
			const at = rulesRefreshAt(new Date(expiresAt)).getTime();
			expect(expiresAt - at).toBeGreaterThanOrEqual(15 * MINUTE);
			expect(at).toBeGreaterThan(ranAt);
			if (at < end && !queued.has(at)) {
				queued.add(at);
				due.push(at + 5_000);
				due.sort((x, y) => x - y);
			}
		}
		expect(runs).toBe(2 + 8);
	});
});
