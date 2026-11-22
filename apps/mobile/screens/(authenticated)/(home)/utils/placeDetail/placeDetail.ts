export function placeDetail({
	placeName,
	projectName,
}: {
	placeName: string;
	projectName: string | null;
}): string {
	return projectName ? `${projectName} · ${placeName}` : placeName;
}
