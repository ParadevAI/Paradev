export interface Amount {
	gbHours: number;
	usd: number;
}

interface Credit {
	usedGbHours: number;
	totalGbHours: number;
	usedUsd: number;
	totalUsd: number;
}

/** The period's allowance as the cloud router gives it, every dollar field priced. */
export interface PricedAllowanceAmounts {
	includedGbHours: number | null;
	includedUsd: number | null;
	/** Billing's monthly usage: the seats' amount, then the priced row. */
	usedGbHours: number;
	usedUsd: number;
	/** Usage on the priced row: what billing charges at the period end. */
	overageGbHours: number;
	overageUsd: number;
	freeCredits: Credit | null;
	bought: Credit | null;
}

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
 * Billing's own numbers, as they are: what the organization holds, what it drew from it, and what
 * will be charged. docs/cloud-usage-display.md is generated from its scenario table.
 */
export function cloudUsageDisplay(
	allowance: PricedAllowanceAmounts | null,
	metered: Amount,
): CloudUsageDisplay {
	if (allowance?.includedGbHours == null || allowance.includedUsd === null) {
		return { used: metered, held: null, over: null, lines: [] };
	}
	const over = { gbHours: allowance.overageGbHours, usd: allowance.overageUsd };
	const credits = (["freeCredits", "bought"] as const).flatMap((kind) => {
		const credit = allowance[kind];
		return credit
			? [
					{
						kind,
						used: { gbHours: credit.usedGbHours, usd: credit.usedUsd },
						total: { gbHours: credit.totalGbHours, usd: credit.totalUsd },
					},
				]
			: [];
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
