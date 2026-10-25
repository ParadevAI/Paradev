import { describe, expect, test } from "bun:test";
import {
	ACCESS_RETRY_MS,
	accessRefetchInterval,
	createFailureStreak,
	MAX_ERROR_RETRY_MS,
} from "./accessRefetchInterval";

const NOW = 1_000_000;
const error = { data: { code: "INTERNAL_SERVER_ERROR" } };

describe("accessRefetchInterval", () => {
	test("retries soon before the first ticket arrives", () => {
		expect(accessRefetchInterval({}, NOW)).toBe(ACCESS_RETRY_MS);
	});

	test("re-mints at 80% of a ticket's remaining life", () => {
		const expiresAt = NOW + 60 * 60 * 1000;
		expect(accessRefetchInterval({ data: { expiresAt } }, NOW)).toBe(
			48 * 60 * 1000,
		);
	});

	test.each([
		"FORBIDDEN",
		"INTERNAL_SERVER_ERROR",
	])("a %s retries soon, then backs off to the cap", (code) => {
		const after = (consecutiveFailures: number) =>
			accessRefetchInterval(
				{ error: { data: { code } }, consecutiveFailures },
				NOW,
			);
		expect(after(1)).toBe(ACCESS_RETRY_MS);
		expect(after(3)).toBe(4 * ACCESS_RETRY_MS);
		expect(after(50)).toBe(MAX_ERROR_RETRY_MS);
	});
});

describe("createFailureStreak", () => {
	test("counts only the failures since the last success", () => {
		const streak = createFailureStreak();
		expect(streak("a", { errorUpdateCount: 0 })).toBe(0);
		expect(streak("a", { error, errorUpdateCount: 1 })).toBe(1);
		expect(streak("a", { error, errorUpdateCount: 2 })).toBe(2);
		expect(streak("a", { errorUpdateCount: 2 })).toBe(0);
		expect(streak("a", { error, errorUpdateCount: 3 })).toBe(1);
	});

	test("a failure long after the last success still starts at 30 seconds", () => {
		const streak = createFailureStreak();
		streak("a", { errorUpdateCount: 40 });
		const failures = streak("a", { error, errorUpdateCount: 41 });
		expect(
			accessRefetchInterval({ error, consecutiveFailures: failures }, NOW),
		).toBe(ACCESS_RETRY_MS);
	});

	test("keeps each query's streak separate", () => {
		const streak = createFailureStreak();
		streak("a", { errorUpdateCount: 0 });
		streak("b", { errorUpdateCount: 5 });
		expect(streak("a", { error, errorUpdateCount: 1 })).toBe(1);
		expect(streak("b", { error, errorUpdateCount: 6 })).toBe(1);
	});
});
