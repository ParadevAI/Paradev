import { parseDiffFromFile } from "@pierre/diffs";
import type { ToolContent } from "@superset/chat/protocol";

export type PreviewLine = {
	kind: "context" | "add" | "del";
	/** In the new file, or in the old file for a deleted line. */
	number: number;
	text: string;
};

export const MAX_PREVIEW_LINES = 6;
const MAX_LINE_CHARS = 120;
/** Past this many characters the lines are not worth the diff they cost. */
const MAX_PREVIEW_CHARS = 400_000;

type DiffToolContent = Extract<ToolContent, { type: "diff" }>;

/** A line as the reader saw it: without the newline the diff keeps, and short. */
function capped(raw: string): string {
	const text = raw.replace(/\r?\n$/, "");
	return text.length > MAX_LINE_CHARS
		? `${text.slice(0, MAX_LINE_CHARS)}…`
		: text;
}

/**
 * The lines that show an edit at a glance: from one line before the first
 * change, `MAX_PREVIEW_LINES` of them. Empty when nothing changed, null when
 * the file is too large to diff for a glance.
 */
export function diffPreviewLines(
	content: DiffToolContent,
): PreviewLine[] | null {
	const size = content.newText.length + (content.oldText?.length ?? 0);
	if (size > MAX_PREVIEW_CHARS) return null;
	let parsed: ReturnType<typeof parseDiffFromFile>;
	try {
		parsed = parseDiffFromFile(
			content.oldText === null
				? null
				: { name: content.path, contents: content.oldText },
			{ name: content.path, contents: content.newText },
		);
	} catch (error) {
		console.warn("[chat] diff preview failed", content.path, error);
		return null;
	}

	const lines: PreviewLine[] = [];
	const additions = parsed.additionLines ?? [];
	const deletions = parsed.deletionLines ?? [];
	let firstChange = -1;
	const enough = () =>
		firstChange !== -1 && lines.length >= firstChange + MAX_PREVIEW_LINES;
	for (const hunk of parsed.hunks) {
		let newLine = hunk.additionStart;
		let oldLine = hunk.deletionStart;
		for (const block of hunk.hunkContent) {
			if (block.type === "context") {
				for (let k = 0; k < block.lines; k++) {
					lines.push({
						kind: "context",
						number: newLine + k,
						text: additions[block.additionLineIndex + k] ?? "",
					});
				}
				newLine += block.lines;
				oldLine += block.lines;
				continue;
			}
			if (firstChange === -1) firstChange = lines.length;
			for (let k = 0; k < block.deletions; k++) {
				lines.push({
					kind: "del",
					number: oldLine + k,
					text: deletions[block.deletionLineIndex + k] ?? "",
				});
			}
			oldLine += block.deletions;
			for (let k = 0; k < block.additions; k++) {
				lines.push({
					kind: "add",
					number: newLine + k,
					text: additions[block.additionLineIndex + k] ?? "",
				});
			}
			newLine += block.additions;
			if (enough()) break;
		}
		if (enough()) break;
	}
	if (firstChange === -1) return [];
	const start = Math.max(0, firstChange - 1);
	return lines
		.slice(start, start + MAX_PREVIEW_LINES)
		.map((line) => ({ ...line, text: capped(line.text) }));
}
