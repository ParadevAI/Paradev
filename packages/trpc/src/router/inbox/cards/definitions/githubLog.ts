const STAMP = /^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z /;
// biome-ignore lint/suspicious/noControlCharactersInRegex: strips terminal colour codes from a CI log
const COLOUR = /\u001b\[[0-9;]*[A-Za-z]/g;
const ERROR = "##[error]";
const LINES_BEFORE = 30;
const LINE_MAX = 300;
const ERRORS_MAX = 8;
const LOG_MAX = 4000;

const clip = (line: string) =>
	line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1)}…` : line;

/** What a reader needs from a failed job's log: GitHub's error lines, and the lines that lead to the first of them. */
export function logExcerpt(raw: string): { errors: string[]; log: string } {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.replace(STAMP, "").replace(COLOUR, ""));
	const first = lines.findIndex((line) => line.startsWith(ERROR));
	const end = first === -1 ? lines.length : first + 1;
	const shown = lines
		.slice(Math.max(0, end - LINES_BEFORE - 1), end)
		.filter((line) => line !== "##[endgroup]")
		.map((line) =>
			clip(line.replace(/^##\[(group|error|warning|command)\]/, "")),
		);
	while (shown.length && shown[0]?.trim() === "") shown.shift();
	const log = shown.join("\n").trim();
	return {
		errors: lines
			.filter((line) => line.startsWith(ERROR))
			.slice(0, ERRORS_MAX)
			.map((line) => clip(line.slice(ERROR.length))),
		log: log.length > LOG_MAX ? `…${log.slice(-LOG_MAX)}` : log,
	};
}
