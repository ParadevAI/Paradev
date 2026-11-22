/**
 * A search result's second line. Under All hosts two places can hold the
 * same names, so it names the place; elsewhere the place is the scope.
 */
export function searchRowDetail({
	placeName,
	projectName,
	branch,
}: {
	/** Set under All hosts only. */
	placeName: string | null;
	projectName: string | null;
	branch: string;
}): string {
	if (placeName) {
		return projectName ? `${projectName} · ${placeName}` : placeName;
	}
	return projectName ? `${projectName} · ${branch}` : branch;
}
