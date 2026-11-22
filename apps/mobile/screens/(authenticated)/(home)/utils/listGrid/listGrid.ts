/**
 * Home's list grid, in points: rows inset by the margin, a 24pt lead slot
 * and a 12pt gap put every name at 52pt, 68pt for a row inside a group.
 */
export const LIST_GRID = {
	margin: 16,
	nameColumn: 52,
	groupedNameColumn: 68,
	/** The row padding that puts the name on the column: pl-4 or pl-8, then size-6 and gap-3. */
	rowPadding: { plain: "pl-4 pr-4", grouped: "pl-8 pr-4" },
} as const;
