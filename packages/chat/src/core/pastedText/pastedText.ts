export const PASTED_TEXT_MIN_LINES = 25;
export const PASTED_TEXT_MIN_CHARS = 4000;

const OPEN_TAG = /^<pasted_text lines="(\d+)">$/;
const CLOSE_TAG = "</pasted_text>";

export function normalizePastedText(raw: string): string {
	return raw.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
}

export function countLines(text: string): number {
	return text.split("\n").length;
}

export function firstLine(text: string): string {
	return (
		text
			.split("\n")
			.find((line) => line.trim() !== "")
			?.trim() ?? ""
	);
}

export function isLargePaste(text: string): boolean {
	if (text.trim() === "") return false;
	return (
		text.length >= PASTED_TEXT_MIN_CHARS ||
		countLines(text) >= PASTED_TEXT_MIN_LINES
	);
}

/**
 * Appends each paste as a trailing block. The line count in the opening tag
 * bounds the block, so a paste that itself contains the tags still parses.
 */
export function appendPastedText(
	prompt: string,
	pastes: readonly string[],
): string {
	if (pastes.length === 0) return prompt;
	const blocks = pastes.map(
		(paste) =>
			`<pasted_text lines="${countLines(paste)}">\n${paste}\n${CLOSE_TAG}`,
	);
	return [prompt, ...blocks].filter(Boolean).join("\n\n");
}

export function parsePastedText(message: string): {
	text: string;
	pastes: string[];
} {
	const lines = message.split("\n");
	for (let index = 0; index < lines.length; index++) {
		if (!OPEN_TAG.test(lines[index] ?? "")) continue;
		const pastes = readBlocks(lines, index);
		if (pastes) {
			return { text: lines.slice(0, index).join("\n").trimEnd(), pastes };
		}
	}
	return { text: message, pastes: [] };
}

function readBlocks(lines: readonly string[], start: number): string[] | null {
	const pastes: string[] = [];
	let cursor = start;
	while (cursor < lines.length) {
		const line = lines[cursor] ?? "";
		if (line === "") {
			cursor++;
			continue;
		}
		const count = Number(OPEN_TAG.exec(line)?.[1] ?? 0);
		const close = cursor + count + 1;
		if (count < 1 || lines[close] !== CLOSE_TAG) return null;
		pastes.push(lines.slice(cursor + 1, close).join("\n"));
		cursor = close + 1;
	}
	return pastes;
}
