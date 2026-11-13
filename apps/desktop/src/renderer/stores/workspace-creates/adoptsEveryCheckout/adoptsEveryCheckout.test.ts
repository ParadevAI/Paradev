import { describe, expect, it } from "bun:test";
import { adoptsEveryCheckout } from "./adoptsEveryCheckout";

describe("adoptsEveryCheckout", () => {
	it("is true only when every checkout of the workspace is an existing worktree", () => {
		const snapshot = {
			projectId: "p",
			checkouts: {
				a: { worktreePath: "/w/a" },
				b: { worktreePath: "/w/b" },
			},
		};
		expect(adoptsEveryCheckout(snapshot, 2)).toBe(true);
		expect(adoptsEveryCheckout(snapshot, 3)).toBe(false);
		expect(
			adoptsEveryCheckout(
				{
					projectId: "p",
					checkouts: { a: { baseBranch: "main" }, b: { worktreePath: "/w/b" } },
				},
				2,
			),
		).toBe(false);
	});

	it("is false when nothing is adopted", () => {
		expect(
			adoptsEveryCheckout(
				{ projectId: "p", checkouts: { a: { baseBranch: "main" } } },
				1,
			),
		).toBe(false);
	});
});
