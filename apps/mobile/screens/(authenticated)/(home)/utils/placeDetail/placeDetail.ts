/** Where a row lives when it is listed away from its project: project · place. */
export function placeDetail({
	placeName,
	projectName,
}: {
	placeName: string;
	projectName: string | null;
}): string {
	return projectName ? `${projectName} · ${placeName}` : placeName;
}
