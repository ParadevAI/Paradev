import { describe, expect, test } from "bun:test";

import { formatOutput, table } from "./output";

const URL = "http://localhost:3000/page/schema-history-superset-7njjhq";
const ROWS = [{ title: "Schema history", url: URL }];
const COLUMNS = ["title", "url"];
const CAPS = [30, 50];

const ESC = "\x1b";
const BEL = "\x07";
// Built from constants: a regex literal cannot hold control characters.
const OSC8 = new RegExp(`${ESC}\\]8;;[^${BEL}]*${BEL}`, "g");

const LINKING = { isTTY: true, term: "xterm-256color" };
const PIPE = { isTTY: false, term: "xterm-256color" };

describe("formatOutput", () => {
	const raw = { raw: "#!/bin/sh\necho hi\n" };

	test("prints a raw result verbatim in every mode", () => {
		expect(formatOutput(raw, undefined, { json: true, quiet: false })).toBe(
			raw.raw,
		);
		expect(formatOutput(raw, undefined, { json: false, quiet: true })).toBe(
			raw.raw,
		);
		expect(
			formatOutput(raw, () => "shown", { json: false, quiet: false }),
		).toBe(raw.raw);
	});

	test("treats a data object with a non-string raw field as data", () => {
		const out = formatOutput({ raw: 1 }, undefined, {
			json: true,
			quiet: false,
		});
		expect(JSON.parse(out)).toEqual({ raw: 1 });
	});

	test("treats a result that carries data or message beside raw as data", () => {
		const out = formatOutput({ raw: "x", data: { id: 1 } }, undefined, {
			json: true,
			quiet: false,
		});
		expect(JSON.parse(out)).toEqual({ id: 1 });
	});
});

describe("table", () => {
	test("truncates a cell wider than its cap", () => {
		const out = table(
			[{ title: "Schema history for every published page and version" }],
			["title"],
			undefined,
			[30],
			PIPE,
		);
		expect(out).toContain("Schema history for every publ…");
	});

	test("prints a URL in full however narrow its column", () => {
		const out = table(ROWS, COLUMNS, undefined, CAPS, PIPE);
		expect(out).toContain(URL);
		expect(out).not.toContain("…");
		expect(out).not.toContain("\x1b]8;;");
	});

	test("links the URL it prints", () => {
		const out = table(ROWS, COLUMNS, undefined, CAPS, LINKING);
		expect(out).toContain(`\x1b]8;;${URL}\x07${URL}\x1b]8;;\x07`);
	});

	test("prints a plain URL on a dumb terminal", () => {
		const out = table(ROWS, COLUMNS, undefined, CAPS, {
			isTTY: true,
			term: "dumb",
		});
		expect(out).toContain(URL);
		expect(out).not.toContain("\x1b]8;;");
	});

	test("keeps padding outside the link so it stops at the URL", () => {
		const out = table(
			[{ url: "http://a.dev" }, { url: URL }],
			["url"],
			["URL"],
			[50],
			LINKING,
		);
		expect(out).toContain("\x07http://a.dev\x1b]8;;\x07");
	});

	test("columns line up whether or not links are emitted", () => {
		const widths = [LINKING, PIPE].map((terminal) =>
			table(ROWS, COLUMNS, undefined, CAPS, terminal)
				.split("\n")
				.map((line) => line.replace(OSC8, "").length),
		);
		expect(widths[0]).toEqual(widths[1]!);
	});

	test("lines the next column up behind a URL wider than its cap", () => {
		const lines = table(
			[
				{ url: URL, id: "4a436fc7" },
				{ url: "http://a.dev", id: "860b82f8" },
			],
			["url", "id"],
			["URL", "ID"],
			[20, 10],
			PIPE,
		).split("\n");
		const starts = ["ID", "4a436fc7", "860b82f8"].map((cell, i) =>
			lines[i]?.indexOf(cell),
		);
		expect(new Set(starts).size).toBe(1);
	});

	test("leaves non-URL cells alone", () => {
		const out = table([{ id: "not a url" }], ["id"], ["ID"], [30], LINKING);
		expect(out).not.toContain("\x1b]8;;");
	});
});

describe("formatOutput --quiet", () => {
	test("lists the ids inside a paginated envelope", () => {
		const out = formatOutput(
			{ data: { items: [{ id: "a" }, { id: "b" }], nextCursor: "tok" } },
			undefined,
			{ json: false, quiet: true },
		);
		expect(out).toBe("a\nb");
	});

	test("still lists the ids of a bare array", () => {
		const out = formatOutput([{ id: "a" }, { id: "b" }], undefined, {
			json: false,
			quiet: true,
		});
		expect(out).toBe("a\nb");
	});

	test("leaves an object that merely has items alone", () => {
		const out = formatOutput({ items: [{ id: "a" }] }, undefined, {
			json: false,
			quiet: true,
		});
		expect(out).toBe(JSON.stringify({ items: [{ id: "a" }] }));
	});
});

describe("formatOutput --json", () => {
	test("hands the cursor to the caller alongside the rows", () => {
		const out = formatOutput(
			{ data: { items: [{ id: "a" }], nextCursor: "tok" } },
			undefined,
			{ json: true, quiet: false },
		);
		expect(JSON.parse(out)).toEqual({
			items: [{ id: "a" }],
			nextCursor: "tok",
		});
	});
});
