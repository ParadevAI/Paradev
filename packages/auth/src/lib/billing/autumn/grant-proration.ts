import type { getAutumnCustomer } from "./customer";
import { BOX_GB_MINUTES_FEATURE_ID } from "./features";

type Customer = Awaited<ReturnType<typeof getAutumnCustomer>>;

export interface MonthlyGrant {
	planId: string | null;
	seats: number;
	balanceId: string;
	includedGbMinutes: number;
	remainingGbMinutes: number;
	resetsAt: number;
}

export interface GrantState {
	planId: string | null;
	seats: number;
	nominalGbMinutes: number;
	/** The grant as Autumn reports it after proration, to tell our own write from a plan change. */
	includedGbMinutes: number;
	resetsAt: number;
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

export function monthlyGrantOf(
	customer: Pick<Customer, "balances" | "licenses">,
	planId: string | null,
): MonthlyGrant | null {
	const balance = customer.balances[BOX_GB_MINUTES_FEATURE_ID];
	if (!balance || balance.unlimited) return null;
	const monthly = (balance.breakdown ?? []).filter(
		(item) =>
			item.reset?.interval === "month" && (item.reset.intervalCount ?? 1) === 1,
	);
	const resetsAt = monthly[0]?.reset?.resetsAt;
	if (!resetsAt || monthly.some((item) => item.reset?.resetsAt !== resetsAt)) {
		return null;
	}
	const grant = monthly.reduce((largest, item) =>
		item.includedGrant > largest.includedGrant ? item : largest,
	);
	return {
		planId,
		seats: sum(customer.licenses.map((license) => license.paidQuantity)),
		balanceId: grant.id,
		includedGbMinutes: sum(monthly.map((item) => item.includedGrant)),
		remainingGbMinutes: sum(monthly.map((item) => item.remaining)),
		resetsAt,
	};
}

/** The same instant one calendar month earlier, on the last day when that month is shorter. */
export function monthBefore(timestamp: number): number {
	const date = new Date(timestamp);
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth() - 1;
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return Date.UTC(
		year,
		month,
		Math.min(date.getUTCDate(), lastDay),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds(),
		date.getUTCMilliseconds(),
	);
}

/**
 * Autumn prorates the price of a mid-period change but grants the full monthly GB-minutes.
 * A null state means nothing changed and nothing should be written.
 */
export function prorateGrant(
	previous: GrantState | null,
	current: MonthlyGrant,
	now: number,
): { adjustment: number; state: GrantState | null } {
	const state: GrantState = {
		planId: current.planId,
		seats: current.seats,
		nominalGbMinutes: current.includedGbMinutes,
		includedGbMinutes: current.includedGbMinutes,
		resetsAt: current.resetsAt,
	};
	if (!previous || previous.resetsAt !== current.resetsAt) {
		return { adjustment: 0, state };
	}
	const planChanged =
		previous.planId !== current.planId || previous.seats !== current.seats;
	const grantChanged = previous.includedGbMinutes !== current.includedGbMinutes;
	if (!grantChanged) return { adjustment: 0, state: null };
	if (!planChanged) return { adjustment: 0, state };

	const periodStart = monthBefore(current.resetsAt);
	const elapsed = Math.min(
		Math.max((now - periodStart) / (current.resetsAt - periodStart), 0),
		1,
	);
	const prorated =
		-(current.includedGbMinutes - previous.nominalGbMinutes) * elapsed;
	const floor = -Math.max(current.remainingGbMinutes, 0);
	return { adjustment: Math.round(Math.max(prorated, floor)), state };
}
