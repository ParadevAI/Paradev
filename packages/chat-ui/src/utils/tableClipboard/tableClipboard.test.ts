import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

const { serializeTable, tableClipboardText } = await import("./tableClipboard");

describe("serializeTable", () => {
	const data = {
		headers: ["Region", "Rate, net", "Note"],
		rows: [
			["EU", "20%", 'Says "hi"'],
			["US", "a|b", "two\nlines"],
		],
	};

	test("CSV quotes cells with commas, quotes or newlines and doubles quotes", () => {
		expect(serializeTable(data, "csv")).toBe(
			[
				'Region,"Rate, net",Note',
				'EU,20%,"Says ""hi"""',
				'US,a|b,"two\nlines"',
			].join("\n"),
		);
	});

	test("Markdown writes a header rule, escapes pipes and keeps a cell on one row", () => {
		expect(serializeTable(data, "markdown")).toBe(
			[
				"| Region | Rate, net | Note |",
				"| --- | --- | --- |",
				'| EU | 20% | Says "hi" |',
				"| US | a\\|b | two<br>lines |",
			].join("\n"),
		);
	});
});

test("tableClipboardText reads cells as plain text", () => {
	document.body.innerHTML = `<table>
		<thead><tr><th>Name</th><th>Size</th></tr></thead>
		<tbody><tr><td><code>a.ts</code></td><td><a href="x"><strong>2</strong> KB</a></td></tr></tbody>
	</table>`;
	const table = document.querySelector("table") as HTMLTableElement;
	expect(tableClipboardText(table, "csv")).toBe("Name,Size\na.ts,2 KB");
});
