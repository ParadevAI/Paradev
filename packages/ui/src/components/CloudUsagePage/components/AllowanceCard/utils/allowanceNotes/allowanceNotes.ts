import type { CloudPeriod } from "../../../../types";

export type AllowanceNote =
	/** Billing keeps the allowance for the open period only. */
	| "closed_period"
	/** Billing data cached before seats, credits and the cap were read. */
	| "not_read"
	/** The extra-usage cap is a percentage whose base is not known. */
	| "percent_of_allowance"
	/** Billing does not say whether the cap is reached. */
	| "not_tracked";

/** What the card says about the values the router could not give, once per reason. */
export function allowanceNotes(
	unavailable: CloudPeriod["unavailable"],
): AllowanceNote[] {
	const reasons = new Set(
		unavailable.flatMap(({ reason }) =>
			reason === "owners_and_admins_only" ? [] : [reason],
		),
	);
	return (
		[
			"closed_period",
			"not_read",
			"percent_of_allowance",
			"not_tracked",
		] as const
	).filter(
		(note) =>
			reasons.has(note) &&
			!(note === "not_tracked" && reasons.has("percent_of_allowance")),
	);
}
