/** A failed workspace with no boot still counts: it is in `workspaces`. */
export function hasUsage(total: {
	gbHours: number;
	boots: number;
	workspaces?: number;
}): boolean {
	return total.gbHours > 0 || total.boots > 0 || (total.workspaces ?? 0) > 0;
}
