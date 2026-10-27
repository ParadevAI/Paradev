import { expect, test } from "bun:test";
import { isWorktreeMissing } from "./isWorktreeMissing";

const missing = {
	isFetching: false,
	isFetchedAfterMount: true,
	data: { worktreeExists: false },
};

test("a missing worktree stays on its error screen while a refresh runs", () => {
	expect(isWorktreeMissing(missing, false)).toBe(true);
	expect(isWorktreeMissing({ ...missing, isFetching: true }, false)).toBe(true);
});

test("a stale cached answer from before this mount does not show the error screen", () => {
	expect(
		isWorktreeMissing(
			{ ...missing, isFetching: true, isFetchedAfterMount: false },
			false,
		),
	).toBe(false);
	expect(isWorktreeMissing(missing, true)).toBe(false);
});
