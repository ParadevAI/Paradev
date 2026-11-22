import {
	extractTableDataFromElement,
	type TableData,
	tableDataToCSV,
	tableDataToMarkdown,
} from "streamdown";

export type TableCopyFormat = "markdown" | "csv";

const oneLine = (cell: string) => cell.replace(/\r?\n/g, "<br>");

/** CSV quotes a cell with line breaks; a Markdown row has no room for them. */
export function serializeTable(
	data: TableData,
	format: TableCopyFormat,
): string {
	if (format === "csv") return tableDataToCSV(data);
	return tableDataToMarkdown({
		headers: data.headers.map(oneLine),
		rows: data.rows.map((row) => row.map(oneLine)),
	});
}

/** The table as text: cells are their visible text, without markup. */
export function tableClipboardText(
	table: HTMLTableElement,
	format: TableCopyFormat,
): string {
	return serializeTable(extractTableDataFromElement(table), format);
}
