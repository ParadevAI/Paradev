const HEADER = "[SYSTEM NOTIFICATION - NOT USER INPUT]";
const OPEN = "<task-notification>";
const CLOSE = "</task-notification>";
const FIRST_FIELD = "<task-id>";
const REMINDER_OPEN = "<system-reminder>";
const REMINDER_CLOSE = "</system-reminder>";
const HEADER_TO_BLOCK_MAX = 2000;

type UnitEnd = number | "hold" | null;
type Range = [number, number];

function skipSpace(text: string, index: number): number {
	let i = index;
	while (i < text.length && /\s/.test(text.charAt(i))) i++;
	return i;
}

function isBlank(char: string): boolean {
	return char === " " || char === "\t";
}

function startsLine(text: string, index: number): boolean {
	let i = index;
	while (i > 0 && isBlank(text.charAt(i - 1))) i--;
	return i === 0 || text.charAt(i - 1) === "\n";
}

function endsLine(text: string, index: number): "yes" | "partial" | "no" {
	let i = index;
	while (i < text.length && isBlank(text.charAt(i))) i++;
	if (i === text.length) return "partial";
	return text.charAt(i) === "\n" || text.charAt(i) === "\r" ? "yes" : "no";
}

function marker(
	text: string,
	index: number,
	expected: string,
): "full" | "partial" | null {
	const rest = text.slice(index, index + expected.length);
	if (rest === expected) return "full";
	return expected.startsWith(rest) ? "partial" : null;
}

function blockEnd(text: string, index: number, messageEnded: boolean): UnitEnd {
	const open = marker(text, index, OPEN);
	if (open !== "full") return open && !messageEnded ? "hold" : null;
	const fieldAt = skipSpace(text, index + OPEN.length);
	const field = marker(text, fieldAt, FIRST_FIELD);
	if (field === null) return null;
	if (field === "partial") return messageEnded ? text.length : "hold";
	const close = text.indexOf(CLOSE, fieldAt);
	if (close === -1) return messageEnded ? text.length : "hold";
	const afterClose = close + CLOSE.length;
	const tailAt = skipSpace(text, afterClose);
	const tail = marker(text, tailAt, REMINDER_CLOSE);
	if (tail === "full") return tailAt + REMINDER_CLOSE.length;
	return tail && !messageEnded ? "hold" : afterClose;
}

function unitEnd(text: string, start: number, messageEnded: boolean): UnitEnd {
	let i = start;
	const reminder = marker(text, i, REMINDER_OPEN);
	if (reminder === "partial") return messageEnded ? null : "hold";
	if (reminder === "full") i = skipSpace(text, i + REMINDER_OPEN.length);
	const header =
		reminder === "full" || startsLine(text, i) ? marker(text, i, HEADER) : null;
	if (header === "partial") return messageEnded ? null : "hold";
	if (header === "full") {
		const afterHeader = i + HEADER.length;
		const lineEnd = endsLine(text, afterHeader);
		if (lineEnd === "no") return null;
		const open = text.indexOf(OPEN, afterHeader);
		if (open === -1)
			return !messageEnded && text.length - afterHeader <= HEADER_TO_BLOCK_MAX
				? "hold"
				: null;
		if (open - afterHeader > HEADER_TO_BLOCK_MAX) return null;
		i = open;
	}
	return blockEnd(text, i, messageEnded);
}

function within(ranges: readonly Range[], index: number): boolean {
	return ranges.some(([open, close]) => index >= open && index < close);
}

function closingRun(text: string, from: number, run: string): number {
	const blankLine = text.indexOf("\n\n", from);
	const limit = blankLine === -1 ? text.length : blankLine;
	const runs = /`+/g;
	runs.lastIndex = from;
	for (let match = runs.exec(text); match; match = runs.exec(text)) {
		if (match.index >= limit) break;
		if (match[0].length === run.length) return match.index + run.length;
	}
	return blankLine === -1 ? -1 : -2;
}

function codeRanges(text: string, messageEnded: boolean): Range[] {
	const ranges: Range[] = [];
	let fenceAt = -1;
	let fence = "";
	for (const match of text.matchAll(/^ {0,3}(`{3,}|~{3,})/gm)) {
		const run = match[1] ?? "";
		if (fenceAt === -1) {
			fenceAt = match.index;
			fence = run;
		} else if (
			run.charAt(0) === fence.charAt(0) &&
			run.length >= fence.length
		) {
			ranges.push([fenceAt, match.index + match[0].length]);
			fenceAt = -1;
		}
	}
	if (fenceAt !== -1) ranges.push([fenceAt, text.length]);
	const fences = [...ranges];
	const runs = /`+/g;
	for (let match = runs.exec(text); match; match = runs.exec(text)) {
		if (within(fences, match.index)) continue;
		const close = closingRun(text, match.index + match[0].length, match[0]);
		if (close >= 0) {
			ranges.push([match.index, close]);
			runs.lastIndex = close;
		} else if (close === -1 && !messageEnded) {
			ranges.push([match.index, text.length]);
			break;
		}
	}
	return ranges;
}

function mayHoldNotification(text: string): boolean {
	return (
		text.includes(OPEN) ||
		text.includes(HEADER) ||
		/[<[][^<[]{0,60}$/.test(text)
	);
}

export function withoutTaskNotifications(
	text: string,
	messageEnded: boolean,
): string {
	if (!mayHoldNotification(text)) return text;
	const code = codeRanges(text, messageEnded);
	const candidates = /[<[]/g;
	let visible = "";
	let from = 0;
	for (
		let match = candidates.exec(text);
		match;
		match = candidates.exec(text)
	) {
		const start = match.index;
		if (within(code, start)) continue;
		const end = unitEnd(text, start, messageEnded);
		if (end === null) continue;
		visible += text.slice(from, start);
		if (end === "hold") return visible;
		from = skipSpace(text, end);
		candidates.lastIndex = from;
	}
	return visible + text.slice(from);
}
