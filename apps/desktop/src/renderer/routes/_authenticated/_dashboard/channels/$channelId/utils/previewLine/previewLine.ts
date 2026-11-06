import { plainText } from "../plainText";

const LINE_MAX = 160;

/** The first line of a message that says something, as plain words, short enough for a row. */
export function previewLine(markdown: string, max = LINE_MAX): string | null {
	const line = plainText(markdown)
		.split("\n")
		.map((candidate) => candidate.trim())
		.find(Boolean);
	if (!line) return null;
	return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
