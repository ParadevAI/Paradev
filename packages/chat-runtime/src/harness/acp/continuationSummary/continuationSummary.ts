const PREAMBLE =
	/^\s*This session is being continued from a previous conversation[^\n]*\n/;
const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const SUMMARY_HEADER = /^[ \t]*Summary:[ \t]*\r?\n/m;
const TRAILERS = [
	/\n+If you need specific details from before compaction[\s\S]*$/,
	/\n+(?:Please )?[Cc]ontinue the conversation from where (?:it|we) left (?:it )?off[\s\S]*$/,
];

/**
 * The summary Claude Code persists as the user message after a compaction,
 * without the continuation framing it wraps around it for the model.
 */
export function continuationSummary(text: string): string | undefined {
	if (!PREAMBLE.test(text)) return undefined;
	let body = text.replace(PREAMBLE, "").replace(SYSTEM_REMINDER, "");
	const header = SUMMARY_HEADER.exec(body);
	if (header) body = body.slice(header.index + header[0].length);
	for (const trailer of TRAILERS) body = body.replace(trailer, "");
	const summary = body.trim();
	return summary || undefined;
}
