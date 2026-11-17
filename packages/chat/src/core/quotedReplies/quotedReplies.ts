export const QUOTED_REPLY_MAX_CHARS = 4000;

const OPEN_TAG = /^<quoted_reply lines="(\d+)">$/;
const CLOSE_TAG = "</quoted_reply>";

export function normalizeQuote(text: string): string {
	return text
		.replace(/\r\n?/g, "\n")
		.replace(/ /g, " ")
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function formatQuotedReplies(quotes: readonly string[]): string {
	return quotes
		.map(normalizeQuote)
		.filter(Boolean)
		.map((quote) => {
			const lines = quote.split("\n");
			return [
				`<quoted_reply lines="${lines.length}">`,
				...lines,
				CLOSE_TAG,
			].join("\n");
		})
		.join("\n\n");
}

export function withQuotedReplies(
	quotes: readonly string[],
	message: string,
): string {
	const block = formatQuotedReplies(quotes);
	if (!block) return message;
	return message ? `${block}\n\n${message}` : block;
}

/**
 * Reads the quote blocks at the start of a message. The line count in each
 * opening tag bounds its block, so a quote that holds the tags still parses.
 * `offset` is where `text` starts in `message`.
 */
export function splitQuotedReplies(message: string): {
	quotes: string[];
	text: string;
	offset: number;
} {
	const lines = message.split("\n");
	const quotes: string[] = [];
	let cursor = 0;
	let end = 0;
	while (cursor < lines.length) {
		const line = lines[cursor] ?? "";
		if (line === "" && quotes.length > 0) {
			cursor++;
			continue;
		}
		const count = Number(OPEN_TAG.exec(line)?.[1] ?? 0);
		const close = cursor + count + 1;
		if (count < 1 || lines[close] !== CLOSE_TAG) break;
		quotes.push(lines.slice(cursor + 1, close).join("\n"));
		cursor = close + 1;
		end = cursor;
	}
	if (quotes.length === 0) return { quotes, text: message, offset: 0 };
	while (end < lines.length && lines[end] === "") end++;
	const offset = Math.min(
		message.length,
		lines.slice(0, end).reduce((sum, line) => sum + line.length + 1, 0),
	);
	return { quotes, text: message.slice(offset), offset };
}
