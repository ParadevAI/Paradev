const HEADER = "[SYSTEM NOTIFICATION - NOT USER INPUT]";
const OPEN = "<task-notification>";
const CLOSE = "</task-notification>";
const FIRST_FIELD = "<task-id>";
const REMINDER_OPEN = "<system-reminder>";
const REMINDER_CLOSE = "</system-reminder>";
const HEADER_TO_BLOCK_MAX = 2000;

type UnitEnd = number | "hold" | null;

function skipSpace(text: string, index: number): number {
	let i = index;
	while (i < text.length && /\s/.test(text.charAt(i))) i++;
	return i;
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
	if (field !== "full") return field && !messageEnded ? "hold" : null;
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
	const header = marker(text, i, HEADER);
	if (header === "partial") return messageEnded ? null : "hold";
	if (header === "full") {
		const afterHeader = i + HEADER.length;
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

function fencedRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	let openAt = -1;
	let fence = "";
	for (const match of text.matchAll(/^ {0,3}(`{3,}|~{3,})/gm)) {
		const char = match[1]?.charAt(0) ?? "";
		if (openAt === -1) {
			openAt = match.index;
			fence = char;
		} else if (char === fence) {
			ranges.push([openAt, match.index + match[0].length]);
			openAt = -1;
		}
	}
	if (openAt !== -1) ranges.push([openAt, text.length]);
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
	const fences = fencedRanges(text);
	const candidates = /[<[]/g;
	let visible = "";
	let from = 0;
	for (
		let match = candidates.exec(text);
		match;
		match = candidates.exec(text)
	) {
		const start = match.index;
		if (
			text.charAt(start - 1) === "`" ||
			fences.some(([open, close]) => start >= open && start < close)
		)
			continue;
		const end = unitEnd(text, start, messageEnded);
		if (end === null) continue;
		visible += text.slice(from, start);
		if (end === "hold") return visible;
		from = skipSpace(text, end);
		candidates.lastIndex = from;
	}
	return visible + text.slice(from);
}
