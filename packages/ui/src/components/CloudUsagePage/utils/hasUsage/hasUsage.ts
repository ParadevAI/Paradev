/** A failed workspace with no boot still counts: it is in `workspaces`. An unknown count counts too. */
export function hasUsage(total: {
	gbHours: number;
	boots: number;
	workspaces: number | null;
}): boolean {
	return (
		total.gbHours > 0 ||
		total.boots > 0 ||
		total.workspaces === null ||
		total.workspaces > 0
	);
}
