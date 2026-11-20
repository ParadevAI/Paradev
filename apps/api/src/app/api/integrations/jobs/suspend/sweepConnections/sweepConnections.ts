export async function sweepConnections<
	T extends { id: string; organizationId: string },
>({
	rows,
	cursor,
	deadline,
	syncing,
	visit,
	checkpoint,
	now = Date.now,
}: {
	rows: T[];
	cursor: string | null;
	deadline: number;
	syncing: (organizationIds: string[]) => Promise<Set<string>>;
	visit: (row: T, allowed: boolean) => Promise<boolean>;
	checkpoint: (cursor: string | null) => Promise<unknown>;
	now?: () => number;
}) {
	const start = cursor ? rows.findIndex((row) => row.id > cursor) : 0;
	const ordered =
		start > 0 ? [...rows.slice(start), ...rows.slice(0, start)] : rows;
	let checked = 0;
	let last = cursor;
	for (let i = 0; i < ordered.length; i += 20) {
		if (now() >= deadline) break;
		const batch = ordered.slice(i, i + 20);
		const allowed = await syncing(batch.map((row) => row.organizationId));
		for (const row of batch) {
			if (
				now() >= deadline ||
				!(await visit(row, allowed.has(row.organizationId)))
			) {
				await checkpoint(last);
				return { checked, deferred: rows.length - checked };
			}
			checked++;
			last = row.id;
		}
		await checkpoint(last);
	}
	await checkpoint(checked === rows.length ? null : last);
	return { checked, deferred: rows.length - checked };
}
