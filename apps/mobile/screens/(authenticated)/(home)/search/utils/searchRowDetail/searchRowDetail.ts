/** Where a search result lives, as Needs me names it: project · place. */
export function searchRowDetail({
	placeName,
	projectName,
}: {
	placeName: string;
	projectName: string | null;
}): string {
	return projectName ? `${projectName} · ${placeName}` : placeName;
}
