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
 * events, the page's own total, so the headline matches the page unless billing dropped usage
 * past a limit. Usage past the included amount is drawn from free credits, then bought ones; a
 * credit billing has drawn from and that still has some left takes all the rest, because buying a
 * pack restarts billing's count on the carried credit, or, before any recorded draw, the first
 * credit with room does. With overage off nothing is shown over.
 */
export function cloudUsageDisplay(
	allowance: CloudAllowance | null,
	metered: Amount,
): CloudUsageDisplay {
	if (
		allowance?.includedGbHours == null ||
		allowance.includedUsd === null ||
		allowance.usedUsd === null ||
		allowance.overageUsd === null ||
		allowance.usedGbHours < 0
	) {
		return {
			used: {
				gbHours: Math.max(0, metered.gbHours),
				usd: Math.max(0, metered.usd),
			},
			held: null,
			over: null,
			lines: [],
		};
	}
	const perGbHour =
		metered.gbHours > 0
			? metered.usd / metered.gbHours
			: allowance.includedGbHours > 0
				? allowance.includedUsd / allowance.includedGbHours
				: 0;
	const amount = (gbHours: number): Amount => ({
		gbHours,
		usd: gbHours * perGbHour,
	});
	const billedOver = allowance.overageGbHours;
	const includedUsed = Math.min(
		Math.max(0, metered.gbHours - billedOver),
		allowance.includedGbHours,
	);
	let rest = Math.max(0, metered.gbHours - billedOver - includedUsed);
	const held = (["freeCredits", "bought"] as const).flatMap((kind) => {
		const credit = allowance[kind];
		return credit && credit.totalGbHours > 0 ? [{ kind, credit }] : [];
	});
	const hasRoom = ({ credit }: (typeof held)[number]) =>
		credit.totalGbHours > credit.usedGbHours;
	const takesRest =
		[...held]
			.reverse()
			.find((entry) => entry.credit.usedGbHours > 0 && hasRoom(entry)) ??
		held.find(hasRoom);
	const credits = held.flatMap(({ kind, credit }) => {
		const drawn =
			kind === takesRest?.kind ? rest : Math.min(rest, credit.usedGbHours);
		rest -= drawn;
		const available =
			Math.max(0, credit.totalGbHours - credit.usedGbHours) + drawn;
		if (available <= 0) return [];
		return [{ kind, used: amount(drawn), total: amount(available) }];
	});
	const lines: HeldLine[] = [
		{
			kind: "included",
			used: amount(includedUsed),
			total: amount(allowance.includedGbHours),
		},
		...credits,
	];
	const overageOff = allowance.extraUsageLimit?.gbHours === 0;
	const over = overageOff ? 0 : billedOver;
	return {
		used: sum([...lines.map((line) => line.used), amount(over)]),
		held: sum(lines.map((line) => line.total)),
		over: over > 0 ? amount(over) : null,
		lines,
	};
}
