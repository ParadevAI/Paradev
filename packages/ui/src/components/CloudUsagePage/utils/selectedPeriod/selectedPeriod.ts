/** The chosen period, or the newest when nothing is chosen or the choice is gone. */
export function selectedPeriod<TPeriod extends { id: string }>(
	periods: TPeriod[] | undefined,
	periodId: string | undefined,
): TPeriod | undefined {
	return periods?.find((period) => period.id === periodId) ?? periods?.[0];
}
