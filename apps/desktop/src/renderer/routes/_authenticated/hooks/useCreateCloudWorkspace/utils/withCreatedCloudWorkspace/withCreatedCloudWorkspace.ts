/**
 * A list row for the new workspace was fetched after the create committed,
 * so it is at least as new as the create's own snapshot and is kept.
 */
export function withCreatedCloudWorkspace<Row extends { id: string }>(
	rows: Row[] | undefined,
	created: Row,
): Row[] {
	if (!rows) return [created];
	if (rows.some((row) => row.id === created.id)) return rows;
	return [created, ...rows];
}
