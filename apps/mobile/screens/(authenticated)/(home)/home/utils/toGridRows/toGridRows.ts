export type GridRow<T> = { kind: "gridRow"; cells: T[] };

/** Packs each run of consecutive cells into rows of `columns`; other items pass through. */
export function toGridRows<T>(
	items: T[],
	columns: number,
	isCell: (item: T) => boolean,
): Array<T | GridRow<T>> {
	if (columns <= 1) return items;
	const out: Array<T | GridRow<T>> = [];
	let row: GridRow<T> | null = null;
	for (const item of items) {
		if (!isCell(item)) {
			row = null;
			out.push(item);
			continue;
		}
		if (!row || row.cells.length === columns) {
			row = { kind: "gridRow", cells: [] };
			out.push(row);
		}
		row.cells.push(item);
	}
	return out;
}

/** A row's list key; it changes whenever a cell does, so the list re-reports what is visible. */
export const gridRowKey = <T>(row: GridRow<T>, keyOf: (item: T) => string) =>
	`row:${row.cells.map(keyOf).join("|")}`;
