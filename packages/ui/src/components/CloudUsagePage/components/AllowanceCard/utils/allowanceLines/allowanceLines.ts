import type { CloudPeriod } from "../../../../types";

type Allowance = NonNullable<CloudPeriod["allowance"]>;

/** An amount in GB-hours, and in dollars when the organization has a rate. */
export interface Amount {
	gbHours: number;
	usd: number | null;
}

export interface AllowanceLine {
	kind: "included" | "freeCredits" | "bought" | "extra";
	paid: boolean;
	used: Amount;
	/** Null for extra usage with no known cap. */
	total: Amount | null;
}

const sum = (amounts: Amount[]): Amount => ({
	gbHours: amounts.reduce((total, amount) => total + amount.gbHours, 0),
	usd: amounts.every((amount) => amount.usd !== null)
		? amounts.reduce((total, amount) => total + (amount.usd ?? 0), 0)
		: null,
});

/**
 * The card's lines, in the design's order: what the plan includes and free credits, then
 * bought credits and extra usage. `cap` is what the headline measures against: the included
 * total, plus the extra-usage limit when there is one.
 */
export function allowanceLines(allowance: Allowance, included: number) {
	const line = (
		kind: AllowanceLine["kind"],
		credit: Allowance["bought"],
	): AllowanceLine[] =>
		credit
			? [
					{
						kind,
						paid: kind === "bought",
						used: { gbHours: credit.usedGbHours, usd: credit.usedUsd },
						total: { gbHours: credit.totalGbHours, usd: credit.totalUsd },
					},
				]
			: [];
	const limit = allowance.extraUsageLimit;
	const overage: Amount = {
		gbHours: allowance.overageGbHours,
		usd: allowance.overageUsd,
	};
	const lines: AllowanceLine[] = [
		{
			kind: "included",
			paid: false,
			used: {
				gbHours: Math.min(allowance.usedGbHours, included),
				usd:
					allowance.usedUsd === null || allowance.includedUsd === null
						? null
						: Math.min(allowance.usedUsd, allowance.includedUsd),
			},
			total: { gbHours: included, usd: allowance.includedUsd },
		},
		...line("freeCredits", allowance.freeCredits),
		...line("bought", allowance.bought),
		...(limit && limit.gbHours > 0
			? [{ kind: "extra", paid: true, used: overage, total: limit } as const]
			: overage.gbHours > 0
				? [{ kind: "extra", paid: true, used: overage, total: null } as const]
				: []),
	];
	const totalsOf = (items: AllowanceLine[]) =>
		items.flatMap((item) => (item.total ? [item.total] : []));
	const totals = totalsOf(lines);
	const hasCap = lines.some((item) => item.kind === "extra" && item.total);
	return {
		lines,
		cap: hasCap
			? sum(totals)
			: sum(totalsOf(lines.filter((item) => item.kind !== "extra"))),
		hasCap,
		/** The bar's full width: the cap, or everything used when extra usage has no cap. */
		scale: sum([
			...totals,
			...lines.filter((item) => !item.total).map((item) => item.used),
		]),
	};
}
