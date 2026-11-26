import type { getAutumnCustomer } from "./customer";
import { BOX_GB_MINUTES_FEATURE_ID, SEATS_FEATURE_ID } from "./features";

type Customer = Awaited<ReturnType<typeof getAutumnCustomer>>;
type Breakdown = NonNullable<Customer["balances"][string]["breakdown"]>[number];

export interface MonthlyGrant {
	planId: string | null;
	seats: number;
	balanceId: string;
	includedGbMinutes: number;
	usageGbMinutes: number;
	periodStart: number;
	resetsAt: number;
	planStartedAt: number | null;
}

export interface GrantState {
	planId: string | null;
	seats: number;
	includedGbMinutes: number;
	/** What this period should hold for the plans held in it so far. */
	targetGbMinutes: number;
	resetsAt: number;
	/** False until Autumn confirms the target, so the next sync writes it again. */
	applied: boolean;
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
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

export function monthlyGrantOf(
	customer: Pick<Customer, "balances" | "licenses" | "subscriptions">,
	planId: string | null,
): MonthlyGrant | null {
	const balance = customer.balances[BOX_GB_MINUTES_FEATURE_ID];
	if (!balance || balance.unlimited) return null;
	const grant = (balance.breakdown ?? [])
		.filter(
			(item) =>
				item.reset?.interval === "month" &&
				(item.reset.intervalCount ?? 1) === 1 &&
				item.reset.resetsAt,
		)
		.reduce<Breakdown | null>(
			(largest, item) =>
				!largest || item.includedGrant > largest.includedGrant ? item : largest,
			null,
		);
	const resetsAt = grant?.reset?.resetsAt;
	if (!grant || !resetsAt) return null;
	const subscription = customer.subscriptions.find(
		(item) => item.status === "active" && !item.addOn,
	);
	return {
		planId,
		seats:
			sum(customer.licenses.map((license) => license.paidQuantity)) +
			(customer.balances[SEATS_FEATURE_ID]?.granted ?? 0),
		balanceId: grant.id,
		includedGbMinutes: grant.includedGrant,
		usageGbMinutes: grant.usage,
		periodStart:
			subscription?.currentPeriodEnd === resetsAt &&
			subscription.currentPeriodStart
				? subscription.currentPeriodStart
				: monthBefore(resetsAt),
		resetsAt,
		planStartedAt: subscription?.startedAt ?? null,
	};
}

export function initialGrantState(current: MonthlyGrant): GrantState {
	return {
		planId: current.planId,
		seats: current.seats,
		includedGbMinutes: current.includedGbMinutes,
		targetGbMinutes: current.includedGbMinutes,
		resetsAt: current.resetsAt,
		applied: true,
	};
}

/**
 * Autumn prorates the price of a mid-period change but grants the full monthly GB-minutes.
 * `remaining` is the absolute balance to set, so writing it twice gives the same result.
 */
export function prorateGrant(
	previous: GrantState | null,
	current: MonthlyGrant,
	now: number,
): { state: GrantState | null; remaining: number | null } {
	if (!previous || previous.resetsAt !== current.resetsAt) {
		return { state: initialGrantState(current), remaining: null };
	}
	const remainingFor = (target: number) =>
		Math.max(Math.round(target - current.usageGbMinutes), 0);
	const planChanged =
		previous.planId !== current.planId || previous.seats !== current.seats;

	if (!planChanged) {
		const granted = current.includedGbMinutes - previous.includedGbMinutes;
		const state = {
			...previous,
			includedGbMinutes: current.includedGbMinutes,
			targetGbMinutes: previous.targetGbMinutes + granted,
		};
		if (!previous.applied) {
			return { state, remaining: remainingFor(state.targetGbMinutes) };
		}
		if (!granted) return { state: null, remaining: null };
		return { state, remaining: null };
	}

	const changedAt =
		previous.planId !== current.planId &&
		current.planStartedAt &&
		current.planStartedAt > current.periodStart &&
		current.planStartedAt <= now
			? current.planStartedAt
			: now;
	const left = Math.min(
		Math.max(
			(current.resetsAt - changedAt) / (current.resetsAt - current.periodStart),
			0,
		),
		1,
	);
	const target = Math.round(
		previous.targetGbMinutes +
			(current.includedGbMinutes - previous.includedGbMinutes) * left,
	);
	return {
		state: {
			planId: current.planId,
			seats: current.seats,
			includedGbMinutes: current.includedGbMinutes,
			targetGbMinutes: target,
			resetsAt: current.resetsAt,
			applied: false,
		},
		remaining: remainingFor(target),
	};
}
