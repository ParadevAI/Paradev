import { describe, expect, test } from "bun:test";
import type { PullRequestCheckStatus } from "../pull-request";
import { checkRunStatus, computeChecksStatus } from "./pull-request-checks";

describe("checkRunStatus", () => {
	test("a run that is not completed is pending", () => {
		expect(checkRunStatus("IN_PROGRESS", null)).toBe("pending");
		expect(checkRunStatus("QUEUED", "SUCCESS")).toBe("pending");
	});

	test("maps each completed conclusion", () => {
		const cases: [string | null, PullRequestCheckStatus][] = [
			["SUCCESS", "success"],
			["FAILURE", "failure"],
			["TIMED_OUT", "failure"],
			["ACTION_REQUIRED", "failure"],
			["STARTUP_FAILURE", "failure"],
			["CANCELLED", "cancelled"],
			["SKIPPED", "skipped"],
			["NEUTRAL", "skipped"],
			["STALE", "pending"],
			[null, "pending"],
		];
		for (const [conclusion, expected] of cases) {
			expect(checkRunStatus("COMPLETED", conclusion)).toBe(expected);
		}
	});
});

function checks(...statuses: PullRequestCheckStatus[]) {
	return statuses.map((status) => ({ status }));
}

describe("computeChecksStatus", () => {
	test("no checks is none", () => {
		expect(computeChecksStatus([])).toBe("none");
	});

	test("a cancelled check is a failure, not a success", () => {
		expect(computeChecksStatus(checks("success", "cancelled"))).toBe("failure");
	});

	test("failure beats pending", () => {
		expect(computeChecksStatus(checks("pending", "failure"))).toBe("failure");
	});

	test("cancelled beats pending", () => {
		expect(computeChecksStatus(checks("pending", "cancelled"))).toBe("failure");
	});

	test("pending beats success and skipped", () => {
		expect(computeChecksStatus(checks("success", "skipped", "pending"))).toBe(
			"pending",
		);
	});

	test("all success or skipped is success", () => {
		expect(computeChecksStatus(checks("success", "skipped"))).toBe("success");
	});
});
