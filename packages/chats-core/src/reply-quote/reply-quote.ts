import type { ChatState } from "../chat-state/chat-state.ts";
import { renderMentions } from "../mentions/mentions.ts";
import type { Message, ReplyQuote } from "../model/model.ts";
import {
	cutLine,
	messageLine,
} from "../notification-text/notification-text.ts";
import { fileTitle } from "../shared-files/shared-files.ts";

/** A quote shows one line; the original is a tap away. */
export const REPLY_QUOTE_MAX = 140;

/** What a quote is made from: the original's words (mentions already as names) or what its card says. */
export interface QuoteSource {
	text: string;
	taskTitle?: string | null;
	appName?: string | null;
	questionTitle?: string | null;
	fileName?: string | null;
}

/**
 * The line a reply quotes: the original's first line of words with markdown taken out (code fences skipped), or its
 * card's line ("Task: Pay rent"), cut to 140 characters. The server and the apps' optimistic sends both make it here.
 */
export function quoteText(source: QuoteSource): string {
	const first = source.text
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line && !line.startsWith("```"));
	return cutLine(
		messageLine({ ...source, text: first ?? "" }),
		REPLY_QUOTE_MAX,
	);
}

/** The quote of a message the viewer has loaded, as the server will make it: for a reply shown before it's confirmed. */
export function replyQuoteOf(state: ChatState, message: Message): ReplyQuote {
	const dev = message.authorDevId ? state.devs[message.authorDevId] : undefined;
	const person = message.authorId ? state.members[message.authorId] : undefined;
	const task = message.taskId
		? state.tasks.find((t) => t.id === message.taskId)
		: undefined;
	const app = message.appId
		? state.apps.find((a) => a.id === message.appId)
		: undefined;
	return {
		id: message.id,
		authorName: dev?.name ?? person?.name ?? "Dev",
		authorKind: message.authorDevId
			? "dev"
			: message.authorId
				? "person"
				: "note",
		authorId: message.authorDevId ?? message.authorId,
		text: quoteText({
			// Names as everyone reads them (not "You"), as the server writes the quote.
			text: renderMentions(
				message.text,
				(ref) =>
					(ref.kind === "user"
						? state.members[ref.id]?.name
						: state.devs[ref.id]?.name) ?? "someone",
			),
			taskTitle: task?.title,
			appName: app?.name,
			questionTitle: message.question?.title,
			fileName: message.file ? fileTitle(message.file) : null,
		}),
	};
}

/** Who a reply quotes, as the reader sees it: "You" for their own message. */
export function quotedAuthor(state: ChatState, quote: ReplyQuote): string {
	return quote.authorKind === "person" && quote.authorId === state.meId
		? "You"
		: quote.authorName;
}
