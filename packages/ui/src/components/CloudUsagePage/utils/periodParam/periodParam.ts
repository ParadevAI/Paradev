/** The period's id for a link, or undefined for the newest, so the newest period keeps a plain URL. */
export function periodParam<TPeriod extends { id: string }>(
	periods: TPeriod[] | undefined,
	period: TPeriod | undefined,
): string | undefined {
	return period && period !== periods?.[0] ? period.id : undefined;
}
