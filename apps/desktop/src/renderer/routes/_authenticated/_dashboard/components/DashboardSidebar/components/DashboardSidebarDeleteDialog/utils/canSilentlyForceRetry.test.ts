import { describe, expect, test } from "bun:test";
import { canSilentlyForceRetry } from "./canSilentlyForceRetry";

const conflict = { kind: "conflict", message: "dirty" } as const;

describe("canSilentlyForceRetry", () => {
	test("retries a conflict after the dialog finished checking the worktree", () => {
		expect(
			canSilentlyForceRetry(conflict, { force: false, inspectFinished: true }),
		).toBe(true);
	});

	test("does not retry a conflict when the check never finished", () => {
		expect(
			canSilentlyForceRetry(conflict, { force: false, inspectFinished: false }),
		).toBe(false);
	});

	test("does not retry other failures", () => {
		expect(
			canSilentlyForceRetry(
				{ kind: "in-progress", message: "busy" },
				{ force: false, inspectFinished: true },
			),
		).toBe(false);
	});
});
