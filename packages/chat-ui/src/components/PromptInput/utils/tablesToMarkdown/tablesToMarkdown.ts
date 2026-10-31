import { tableClipboardText } from "../../../../utils/tableClipboard";

/** The table reader takes headers only from `thead th`; web tables often put them in the first row. */
function withHeaderRow(table: HTMLTableElement): HTMLTableElement {
	const first = table.rows[0];
	if (table.tHead || !first) return table;
	const header = table.ownerDocument.createElement("tr");
	for (const cell of Array.from(first.cells)) {
		const th = table.ownerDocument.createElement("th");
		th.append(...Array.from(cell.childNodes));
		header.append(th);
	}
	first.remove();
	table.createTHead().append(header);
	return table;
}

/**
 * Pasted HTML with each table swapped for markdown table rows, one paragraph
 * per row, since the composer has no table node. Null when there is no table.
 */
export function tablesToMarkdown(html: string): string | null {
	const document = new DOMParser().parseFromString(html, "text/html");
	const tables = Array.from(document.querySelectorAll("table")).filter(
		(table) => !table.parentElement?.closest("table"),
	);
	if (tables.length === 0) return null;
	for (const table of tables) {
		const rows = tableClipboardText(withHeaderRow(table), "markdown").split(
			"\n",
		);
		table.replaceWith(
			...rows.map((row) => {
				const paragraph = document.createElement("p");
				paragraph.textContent = row;
				return paragraph;
			}),
		);
	}
	return document.body.innerHTML;
}
