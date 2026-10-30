import { describe, expect, test } from "bun:test";
import { computeChecksStatus, parseChecks } from "./pr-resolution";
import type { GHPRResponse } from "./types";

type CheckContext = NonNullable<GHPRResponse["statusCheckRollup"]>[number];

function state(value: CheckContext["state"]): CheckContext {
	return { state: value };
}

function conclusion(value: CheckContext["conclusion"]): CheckContext {
	return { conclusion: value };
}

describe("computeChecksStatus", () => {
	test("no rollup is none", () => {
		expect(computeChecksStatus(null)).toBe("none");
		expect(computeChecksStatus([])).toBe("none");
	});

	test("a cancelled check is a failure, not a success", () => {
		expect(computeChecksStatus([conclusion("CANCELLED")])).toBe("failure");
		expect(
			computeChecksStatus([state("SUCCESS"), conclusion("CANCELLED")]),
		).toBe("failure");
	});

	test("cancelled beats pending, matching the failure/pending precedence used elsewhere", () => {
		expect(
			computeChecksStatus([state("PENDING"), conclusion("CANCELLED")]),
		).toBe("failure");
	});

	test("failure beats pending", () => {
		expect(computeChecksStatus([state("PENDING"), state("FAILURE")])).toBe(
			"failure",
		);
	});

	test("pending beats success", () => {
		expect(computeChecksStatus([state("SUCCESS"), state("PENDING")])).toBe(
			"pending",
		);
	});

	test("a check run that failed to start is a failure", () => {
		expect(computeChecksStatus([conclusion("STARTUP_FAILURE")])).toBe(
			"failure",
		);
		expect(
			computeChecksStatus([state("SUCCESS"), conclusion("STARTUP_FAILURE")]),
		).toBe("failure");
	});

	test("a rollup of only stale checks is pending, not success", () => {
		expect(computeChecksStatus([conclusion("STALE")])).toBe("pending");
	});

	test("a stale check beside a success is pending", () => {
		expect(computeChecksStatus([state("SUCCESS"), conclusion("STALE")])).toBe(
			"pending",
		);
	});

	test("all success is success", () => {
		expect(computeChecksStatus([state("SUCCESS"), state("SUCCESS")])).toBe(
			"success",
		);
	});
});

describe("parseChecks", () => {
	test("a check run that failed to start is a failure", () => {
		expect(parseChecks([conclusion("STARTUP_FAILURE")])).toEqual([
			{ name: "Unknown check", status: "failure", url: undefined },
		]);
	});

	test("a stale check run stays pending", () => {
		expect(parseChecks([conclusion("STALE")])).toEqual([
			{ name: "Unknown check", status: "pending", url: undefined },
		]);
	});
});
