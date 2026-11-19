import type { z } from "zod";
import type { cloudPeriodsOutputSchema } from "./cloud-usage-api";

export interface Amount {
	gbHours: number;
	usd: number;
}

/** The period's allowance, as the cloud router returns it. */
export type CloudAllowance = NonNullable<
	z.output<typeof cloudPeriodsOutputSchema>["items"][number]["allowance"]
>;

export interface HeldLine {
	kind: "included" | "freeCredits" | "bought";
	used: Amount;
	total: Amount;
}

export interface CloudUsageDisplay {
	used: Amount;
	/** Null when billing gives no breakdown: the card shows `used` only. */
	held: Amount | null;
	/** Null unless billing will charge usage past what is held. */
	over: Amount | null;
	lines: HeldLine[];
}

const sum = (amounts: Amount[]): Amount => ({
	gbHours: amounts.reduce((total, amount) => total + amount.gbHours, 0),
	usd: amounts.reduce((total, amount) => total + amount.usd, 0),
});

/**
 * The card's figures for one billing period. `metered` is the period's usage from the usage
 * events, the page's own total: what billing drew from credits this period is the part of it past
 * billing's monthly usage, so a credit line counts this period and what was left at its start.
 */
export function cloudUsageDisplay(
	allowance: CloudAllowance | null,
	metered: Amount,
): CloudUsageDisplay {
	if (
		allowance?.includedGbHours == null ||
		allowance.includedUsd === null ||
		allowance.usedUsd === null ||
		allowance.overageUsd === null
	) {
		return { used: metered, held: null, over: null, lines: [] };
	}
	const over = { gbHours: allowance.overageGbHours, usd: allowance.overageUsd };
	let toDraw = Math.max(0, metered.gbHours - allowance.usedGbHours);
	const credits = (["freeCredits", "bought"] as const).flatMap((kind) => {
		const credit = allowance[kind];
		if (!credit || credit.totalUsd === null) return [];
		const drawn = Math.min(toDraw, credit.usedGbHours);
		toDraw -= drawn;
		const perGbHour = credit.totalUsd / credit.totalGbHours;
		const available = credit.totalGbHours - credit.usedGbHours + drawn;
		if (available <= 0) return [];
		return [
			{
				kind,
				used: { gbHours: drawn, usd: drawn * perGbHour },
				total: { gbHours: available, usd: available * perGbHour },
			},
		];
	});
	const lines: HeldLine[] = [
		{
			kind: "included",
			used: {
				gbHours: allowance.usedGbHours - over.gbHours,
				usd: allowance.usedUsd - over.usd,
			},
			total: { gbHours: allowance.includedGbHours, usd: allowance.includedUsd },
		},
		...credits,
	];
	const isOver = over.gbHours > 0;
	return {
		used: sum([...lines.map((line) => line.used), ...(isOver ? [over] : [])]),
		held: sum(lines.map((line) => line.total)),
		over: isOver ? over : null,
		lines,
	};
}
