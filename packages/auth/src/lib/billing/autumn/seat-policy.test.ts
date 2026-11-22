import { describe, expect, test } from "bun:test";
import {
	licenseSeatAction,
	seatRenewal,
	withRetry,
	yearlyChangeStart,
} from "./seat-policy";

const RENEWAL = 1_800_000_000_000;

describe("licenseSeatAction", () => {
	test("a new member is billed now", () => {
		expect(
			licenseSeatAction({
				paid: 3,
				members: 4,
				decreasePending: false,
				periodEnd: RENEWAL,
			}),
		).toEqual({ kind: "update", quantity: 4 });
	});

	test("a removed member's seat stays paid until renewal, then drops", () => {
		expect(
			licenseSeatAction({
				paid: 3,
				members: 2,
				decreasePending: false,
				periodEnd: RENEWAL,
			}),
		).toEqual({ kind: "schedule", now: 3, atRenewal: 2 });
	});

	test("a member added while a decrease is pending replaces the schedule", () => {
		expect(
			licenseSeatAction({
				paid: 3,
				members: 4,
				decreasePending: true,
				periodEnd: RENEWAL,
			}),
		).toEqual({ kind: "schedule", now: 4, atRenewal: null });
		expect(
			licenseSeatAction({
				paid: 3,
				members: 3,
				decreasePending: true,
				periodEnd: RENEWAL,
			}),
		).toEqual({ kind: "schedule", now: 3, atRenewal: null });
	});

	test("nothing changes when seats already match", () => {
		expect(
			licenseSeatAction({
				paid: 3,
				members: 3,
				decreasePending: false,
				periodEnd: RENEWAL,
			}),
		).toEqual({ kind: "none" });
	});
});

describe("withRetry", () => {
	test("a transient failure is retried until it succeeds", async () => {
		let calls = 0;
		expect(
			await withRetry(
				async () => {
					calls++;
					if (calls < 3) throw new Error("timeout");
					return "ok";
				},
				{ delayMs: 0 },
			),
		).toBe("ok");
		expect(calls).toBe(3);
	});
});

describe("seatRenewal", () => {
	const startedAt = Date.UTC(2026, 9, 22, 7, 30);
	test("monthly seats renew with the plan's period", () => {
		expect(
			seatRenewal({
				startedAt,
				currentPeriodEnd: Date.UTC(2026, 10, 22, 7, 30),
				seatInterval: "month",
				now: Date.UTC(2026, 10, 1),
			}),
		).toBe(Date.UTC(2026, 10, 22, 7, 30));
	});

	test("yearly seats renew on the next anniversary of the start", () => {
		expect(
			seatRenewal({
				startedAt,
				currentPeriodEnd: Date.UTC(2026, 10, 22, 7, 30),
				seatInterval: "year",
				now: Date.UTC(2026, 10, 1),
			}),
		).toBe(Date.UTC(2027, 9, 22, 7, 30));
		expect(
			seatRenewal({
				startedAt,
				currentPeriodEnd: null,
				seatInterval: "year",
				now: Date.UTC(2027, 11, 1),
			}),
		).toBe(Date.UTC(2028, 9, 22, 7, 30));
	});
});

describe("yearlyChangeStart", () => {
	const now = Date.UTC(2026, 9, 23);
	const startedAt = Date.UTC(2026, 9, 22, 22, 23, 39);
	const monthlyPeriodEnd = Date.UTC(2026, 10, 22, 22, 22, 1);

	test("a downgrade from a yearly plan starts at the yearly renewal", () => {
		expect(
			yearlyChangeStart({
				scheduledAt: monthlyPeriodEnd,
				seatInterval: "year",
				startedAt,
				currentPeriodEnd: monthlyPeriodEnd,
				now,
			}),
		).toBe(Date.UTC(2027, 9, 22, 22, 23, 39));
	});

	test("monthly plans and immediate changes keep Autumn's timing", () => {
		const base = { startedAt, currentPeriodEnd: monthlyPeriodEnd, now };
		expect(
			yearlyChangeStart({
				...base,
				scheduledAt: monthlyPeriodEnd,
				seatInterval: "month",
			}),
		).toBeNull();
		expect(
			yearlyChangeStart({ ...base, scheduledAt: null, seatInterval: "year" }),
		).toBeNull();
	});
});
