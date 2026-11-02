import type { ChatRow } from "../../../../utils/chatRows";

export interface TextRow {
	row: ChatRow;
	text: string;
}

/**
 * Pairs each row with its text. A row keeps its entry until its text changes,
 * so a list that re-renders a cell only when its data changes updates just
 * the streaming row.
 */
export function withRowText(
	rows: readonly ChatRow[],
	textOf: (row: ChatRow) => string,
	previous: WeakMap<ChatRow, TextRow>,
): TextRow[] {
	return rows.map((row) => {
		const text = textOf(row);
		const kept = previous.get(row);
		if (kept?.text === text) return kept;
		const entry = { row, text };
		previous.set(row, entry);
		return entry;
	});
}
