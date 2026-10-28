import {
	extractTableDataFromElement,
	type TableData,
	tableDataToCSV,
	tableDataToMarkdown,
} from "streamdown";

export type TableCopyFormat = "markdown" | "csv";

export function serializeTable(
	data: TableData,
	format: TableCopyFormat,
): string {
	return format === "csv" ? tableDataToCSV(data) : tableDataToMarkdown(data);
}

/** The table as text: cells are their visible text, without markup. */
export function tableClipboardText(
	table: HTMLTableElement,
	format: TableCopyFormat,
): string {
	return serializeTable(extractTableDataFromElement(table), format);
}
