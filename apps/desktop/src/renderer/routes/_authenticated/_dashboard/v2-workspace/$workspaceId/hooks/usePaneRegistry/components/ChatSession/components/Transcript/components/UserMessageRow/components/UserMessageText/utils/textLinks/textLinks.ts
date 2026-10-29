export type TextLinkPart =
	| { kind: "text"; text: string }
	| { kind: "link"; url: string };

const WEB_URL = /https?:\/\/[^\s<>"']+/gi;
const SENTENCE_PUNCTUATION = /[.,!?;:]/;
const BRACKETS = [
	["(", ")"],
	["[", "]"],
	["{", "}"],
] as const;

function count(text: string, character: string): number {
	return text.split(character).length - 1;
}

function trimUrl(candidate: string): string {
	let end = candidate.length;
	for (;;) {
		const kept = candidate.slice(0, end);
		const last = kept.at(-1) ?? "";
		const closesNothing = BRACKETS.some(
			([open, close]) =>
				last === close && count(kept, close) > count(kept, open),
		);
		if (!SENTENCE_PUNCTUATION.test(last) && !closesNothing) return kept;
		end -= 1;
	}
}

function parseWebUrl(value: string): URL | null {
	try {
		const url = new URL(value);
		const isPlain = !url.username && !url.password && url.hostname !== "";
		return isPlain && /^https?:$/.test(url.protocol) ? url : null;
	} catch {
		return null;
	}
}

export function splitTextLinks(text: string): TextLinkPart[] {
	const parts: TextLinkPart[] = [];
	let cursor = 0;
	for (const match of text.matchAll(WEB_URL)) {
		const url = trimUrl(match[0]);
		if (!parseWebUrl(url)) continue;
		if (match.index > cursor) {
			parts.push({ kind: "text", text: text.slice(cursor, match.index) });
		}
		parts.push({ kind: "link", url });
		cursor = match.index + url.length;
	}
	if (cursor < text.length) {
		parts.push({ kind: "text", text: text.slice(cursor) });
	}
	return parts;
}
