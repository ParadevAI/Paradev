import type { PricedAllowance } from "../../../../utils/priced";

export interface Amount {
	gbHours: number;
	usd: number;
}

export interface AllowanceLine {
	/** `beyond` is usage the other lines do not hold: the period's usage events past what billing counted. */
	kind: "included" | "freeCredits" | "bought" | "extra" | "beyond";
	paid: boolean;
	used: Amount;
	/** Null for extra usage with no known cap, and for `beyond`. */
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
 * the included total, plus the extra-usage limit when there is one.
 */
export function allowanceLines(
	allowance: PricedAllowance,
	included: Amount,
	periodUsed: Amount,
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
	const billed: AllowanceLine[] = [
		{
			kind: "included",
			paid: false,
			used: {
				gbHours: Math.min(allowance.usedGbHours, included.gbHours),
				usd: Math.min(allowance.usedUsd, included.usd),
			},
			total: included,
		},
		...credit("freeCredits", allowance.freeCredits),
		...credit("bought", allowance.bought),
		...(limit && limit.gbHours > 0
			? [{ kind: "extra", paid: true, used: overage, total: limit } as const]
			: overage.gbHours > 0
				? [{ kind: "extra", paid: true, used: overage, total: null } as const]
				: []),
	];
	const beyond = minus(periodUsed, sum(billed.map((line) => line.used)));
	const lines: AllowanceLine[] =
		beyond.gbHours >= BEYOND_MIN_GB_HOURS
			? [...billed, { kind: "beyond", paid: false, used: beyond, total: null }]
			: billed;

	const totalsOf = (items: AllowanceLine[]) =>
		items.flatMap((item) => (item.total ? [item.total] : []));
	const hasCap = lines.some((item) => item.kind === "extra" && item.total);
	const open = lines.filter((item) => !item.total);
	const filled = sum([...totalsOf(lines), ...open.map((item) => item.used)]);
	const leaveOpen = open.length > 0 && allowance.limitReached !== true;
	return {
		lines,
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
