import type { PricedAllowance } from "../../../../utils/priced";

export interface Amount {
	gbHours: number;
	usd: number;
}

/**
 * What each line holds. The lines always add up to the headline.
 * - `included`: usage of the seats' monthly amount, of that amount.
 * - `freeCredits`, `bought`: usage of a granted or bought credit, of the credit.
 * - `extra`: usage past the included amount and the credits, of the extra-usage cap when there is one.
 * - `beyond`: usage the period's events hold past billing's own total (its monthly usage plus each
 *   credit's usage), such as usage not sent yet. Only when every credit was read.
 * - `notBrokenDown`: usage the other lines cannot place because a credit was not read. Billing
 *   may or may not have counted it, so it is never called unbilled.
 * With extra usage off there is no extra line, and the included line holds all of billing's
 * monthly usage, so a stop that overshoots shows as the included line past its total.
 */
export interface AllowanceLine {
	kind:
		| "included"
		| "freeCredits"
		| "bought"
		| "extra"
		| "beyond"
		| "notBrokenDown";
	paid: boolean;
	used: Amount;
	/** Null for extra usage with no cap or an unknown one, and for `beyond` and `notBrokenDown`. */
	total: Amount | null;
}

/** Part of the bar left open when no cap is known, so a full bar always means the cap. */
const OPEN_END = 0.2;
/** Below this, a difference between usage events and billing is rounding, not usage. */
const BEYOND_MIN_GB_HOURS = 0.5;

const sum = (amounts: Amount[]): Amount => ({
	gbHours: amounts.reduce((total, amount) => total + amount.gbHours, 0),
	usd: amounts.reduce((total, amount) => total + amount.usd, 0),
});

const minus = (a: Amount, b: Amount): Amount => ({
	gbHours: a.gbHours - b.gbHours,
	usd: a.usd - b.usd,
});

/**
 * The card's lines, in the design's order: what the plan includes and free credits, then
 * bought credits, extra usage, and any usage the period's events hold beyond those lines.
 * `used` is the sum of the lines, so the headline and the lines always agree. `cap` is
 * the included total, plus the extra-usage limit when there is one. With extra usage off
 * the included total is the cap, so the bar is not left open.
 */
export function allowanceLines(
	allowance: PricedAllowance,
	included: Amount,
	periodUsed: Amount,
	/** The fields the router marks `not_read`. */
	unread: readonly string[] = [],
) {
	const credit = (
		kind: "freeCredits" | "bought",
		line: PricedAllowance["bought"],
	): AllowanceLine[] =>
		line
			? [
					{
						kind,
						paid: kind === "bought",
						used: { gbHours: line.usedGbHours, usd: line.usedUsd },
						total: { gbHours: line.totalGbHours, usd: line.totalUsd },
					},
				]
			: [];
	const limit = allowance.extraUsageLimit;
	const overage: Amount = {
		gbHours: allowance.overageGbHours,
		usd: allowance.overageUsd,
	};
	// With extra usage off there is no extra line: all of billing's monthly usage is the included
	// line's, past its total when workspaces ran on before they stopped at the limit.
	const extraOff = limit !== null && limit.gbHours === 0;
	const monthly: Amount = {
		gbHours: allowance.usedGbHours,
		usd: allowance.usedUsd,
	};
	const billed: AllowanceLine[] = [
		{
			kind: "included",
			paid: false,
			used: extraOff
				? monthly
				: {
						gbHours: Math.max(0, monthly.gbHours - overage.gbHours),
						usd: Math.max(0, monthly.usd - overage.usd),
					},
			total: included,
		},
		...credit("freeCredits", allowance.freeCredits),
		...credit("bought", allowance.bought),
		...(extraOff
			? []
			: limit && limit.gbHours > 0
				? [{ kind: "extra", paid: true, used: overage, total: limit } as const]
				: overage.gbHours > 0
					? [{ kind: "extra", paid: true, used: overage, total: null } as const]
					: []),
	];
	const creditsRead = !unread.some(
		(field) => field === "bought" || field === "freeCredits",
	);
	/** Billing's own total: its monthly usage, extra usage included, plus each credit's usage. */
	const own = sum([
		monthly,
		...billed
			.filter((line) => line.kind === "freeCredits" || line.kind === "bought")
			.map((line) => line.used),
	]);
	const line = (
		kind: "beyond" | "notBrokenDown",
		used: Amount,
	): AllowanceLine[] =>
		used.gbHours >= BEYOND_MIN_GB_HOURS
			? [{ kind, paid: false, used, total: null }]
			: [];
	const lines: AllowanceLine[] = [
		...billed,
		...(creditsRead
			? line("beyond", minus(periodUsed, own))
			: line(
					"notBrokenDown",
					minus(periodUsed, sum(billed.map((item) => item.used))),
				)),
	];

	const totalsOf = (items: AllowanceLine[]) =>
		items.flatMap((item) => (item.total ? [item.total] : []));
	const hasCap = lines.some((item) => item.kind === "extra" && item.total);
	const open = lines.filter((item) => !item.total);
	const filled = sum(
		lines.map((item) =>
			item.total && item.total.gbHours >= item.used.gbHours
				? item.total
				: item.used,
		),
	);
	const capKnown = limit !== null;
	const leaveOpen =
		!capKnown && open.length > 0 && allowance.limitReached !== true;
	const openExtra = lines.some((item) => item.kind === "extra" && !item.total);
	return {
		lines,
		/**
		 * What the headline measures usage against: the cap when it is known, the included total
		 * when nothing goes past it, else nothing, as "of $X included" would read as over it.
		 */
		headline: (hasCap ? "limit" : openExtra ? "period" : "included") as
			| "limit"
			| "period"
			| "included",
		used: sum(lines.map((line) => line.used)),
		cap: hasCap
			? sum(totalsOf(lines))
			: sum(totalsOf(lines.filter((item) => item.kind !== "extra"))),
		hasCap,
		/** The bar's full width. */
		scale: leaveOpen
			? {
					gbHours: filled.gbHours / (1 - OPEN_END),
					usd: filled.usd / (1 - OPEN_END),
				}
			: filled,
	};
}
