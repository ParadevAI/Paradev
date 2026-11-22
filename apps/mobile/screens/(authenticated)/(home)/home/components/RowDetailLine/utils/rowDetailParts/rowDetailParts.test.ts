import { describe, expect, test } from "bun:test";
import { type RowDetailInput, rowDetailParts } from "./rowDetailParts";

const base: RowDetailInput = {
	state: null,
	pullRequest: null,
	diff: null,
	name: "fix-login",
	branch: "fix-login",
	noChanges: "No changes",
};
const line = (input: Partial<RowDetailInput>) =>
	rowDetailParts({ ...base, ...input })
		.map((part) => part.text)
		.join(" · ");

describe("rowDetailParts", () => {
	test("orders state, diff, then branch", () => {
		expect(
			line({
				state: "Working",
				diff: { additions: 3, deletions: 1 },
				branch: "kiet/fix",
			}),
		).toBe("Working · +3 −1 · kiet/fix");
	});

	test("shows the PR status, with its ink, only when there is no live state", () => {
		const open = { label: "Open", ink: "text-emerald-500" };
		expect(rowDetailParts({ ...base, pullRequest: open })[0]).toEqual({
			key: "state",
			text: "Open",
			ink: "text-emerald-500",
		});
		expect(line({ state: "Needs input", pullRequest: open })).toBe(
			"Needs input",
		);
	});

	test("leaves out an empty diff and a branch named like the row", () => {
		expect(
			line({ state: "Failed", diff: { additions: 0, deletions: 0 } }),
		).toBe("Failed");
	});

	test("reads No changes when nothing else has anything to say", () => {
		expect(line({})).toBe("No changes");
	});

	test("context replaces only the branch", () => {
		expect(
			line({
				state: "Ready for review",
				diff: { additions: 1, deletions: 0 },
				branch: "other",
				context: "web · Studio",
			}),
		).toBe("Ready for review · +1 −0 · web · Studio");
	});
});
