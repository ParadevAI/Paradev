import { z } from "zod";
import { encodeRaw } from "../../../../lib/gmail/mime";
import {
	type CalendarFindTimeView,
	type CardContext,
	CardUnavailable,
} from "../types";
import { GMAIL_ID } from "./gmail";
import { gmailFor, notFound, reconnectOnAuthError } from "./gmailClient";
import {
	decodeEntities,
	formatAddress,
	headerOf,
	parseAddressList,
	replyRecipients,
	replySubject,
	threadingHeaders,
} from "./gmailMessages";
import {
	allReplies,
	botFor,
	readerOnly,
	SLACK_ID,
	SLACK_TS,
	slack,
} from "./slackThread";

/** Where someone asked to meet: an email thread, or a Slack thread. */
export const askRefs = {
	gmail_thread: z.string().regex(GMAIL_ID).optional(),
	slack_channel: z.string().regex(SLACK_ID).optional(),
	slack_thread_ts: z.string().regex(SLACK_TS).optional(),
};

export interface AskRefs {
	gmail_thread?: string;
	slack_channel?: string;
	slack_thread_ts?: string;
}

export function oneAsk(refs: AskRefs): boolean {
	const slackAsk = Boolean(refs.slack_channel && refs.slack_thread_ts);
	return Boolean(refs.gmail_thread) !== slackAsk;
}

const SNIPPET_MAX = 400;

export interface Ask {
	view: CalendarFindTimeView["ask"];
	canReply: boolean;
	/** The addresses on the ask's thread, lowercased; null when the source has none to compare. */
	participants: ReadonlySet<string> | null;
	/** Sends the reader's words back where the ask came from. */
	reply: (text: string) => Promise<void>;
}

const THREAD_MOVED =
	"The thread has a new message. Look again before you reply";

async function gmailAsk(ctx: CardContext, threadId: string): Promise<Ask> {
	const gmail = await gmailFor(ctx.organizationId, ctx.readerId);
	const [profile, thread] = await Promise.all([
		gmail.client.users.getProfile({ userId: "me" }).catch(reconnectOnAuthError),
		gmail.client.users.threads
			.get({ userId: "me", id: threadId, format: "full" })
			.catch((error) => {
				if (notFound(error))
					throw new CardUnavailable("gone", "That email thread is gone");
				return reconnectOnAuthError(error);
			}),
	]);
	const me = new Set([(profile.data.emailAddress ?? "").toLowerCase()]);
	const sent = (thread.data.messages ?? []).filter(
		(message) => !(message.labelIds ?? []).includes("DRAFT"),
	);
	const fromOthers = sent.filter(
		(message) =>
			!parseAddressList(headerOf(message.payload ?? undefined, "From")).some(
				(address) => me.has(address.email.toLowerCase()),
			),
	);
	const asked = fromOthers.at(-1) ?? sent.at(-1);
	if (!asked) throw new CardUnavailable("gone", "That email thread is empty");
	const payload = asked.payload ?? undefined;
	const from = parseAddressList(headerOf(payload, "From"))[0];
	const subject = headerOf(sent[0]?.payload ?? undefined, "Subject");
	const last = sent.at(-1) ?? asked;
	const { replyAll } = replyRecipients(last, me);
	return {
		view: {
			source: "gmail",
			from: from?.name ?? from?.email ?? "",
			subject: subject || null,
			snippet: decodeEntities(asked.snippet ?? "").slice(0, SNIPPET_MAX),
			url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(profile.data.emailAddress ?? "")}#all/${threadId}`,
			replyTo: [...replyAll.to, ...replyAll.cc].map(formatAddress),
			version: last.id ?? "",
		},
		canReply: gmail.canSend,
		participants: new Set(
			sent.flatMap((message) =>
				["From", "To", "Cc"].flatMap((header) =>
					parseAddressList(headerOf(message.payload ?? undefined, header)).map(
						(address) => address.email.toLowerCase(),
					),
				),
			),
		),
		reply: async (text) => {
			const headers = threadingHeaders(last);
			await gmail.client.users.messages
				.send({
					userId: "me",
					requestBody: {
						threadId,
						raw: encodeRaw({
							to: replyAll.to.map(formatAddress),
							cc: replyAll.cc.map(formatAddress),
							bcc: [],
							subject: replySubject(subject),
							body: text,
							attachments: [],
							...(headers ? { threadId, ...headers } : {}),
						}),
					},
				})
				.catch(reconnectOnAuthError);
		},
	};
}

async function slackAsk(
	ctx: CardContext,
	channel: string,
	threadTs: string,
): Promise<Ask> {
	const { token } = await botFor(ctx.organizationId, channel);
	const [messages, auth, info] = await Promise.all([
		allReplies(token, channel, threadTs),
		slack(token, "auth.test", z.object({ url: z.string().optional() }), {}),
		slack(
			token,
			"conversations.info",
			z.object({ channel: z.object({ name: z.string().optional() }) }),
			{ channel },
		).catch(() => null),
	]);
	const asked = messages[0];
	if (!asked) throw new CardUnavailable("gone", "That Slack thread is gone");
	const person = asked.user
		? await slack(
				token,
				"users.info",
				z.object({
					user: z.object({
						real_name: z.string().optional(),
						name: z.string().optional(),
					}),
				}),
				{ user: asked.user },
			).catch(() => null)
		: null;
	const canReply = await readerOnly(ctx.organizationId, ctx.readerId).then(
		() => true,
		() => false,
	);
	return {
		view: {
			source: "slack",
			from: person?.user.real_name ?? person?.user.name ?? "Someone",
			subject: null,
			snippet: (asked.text ?? "").slice(0, SNIPPET_MAX),
			url: auth.url
				? `${auth.url.replace(/\/$/, "")}/archives/${channel}/p${threadTs.replace(".", "")}`
				: null,
			replyTo: [info?.channel.name ? `#${info.channel.name}` : channel],
			version: threadTs,
		},
		canReply,
		participants: null,
		reply: async (text) => {
			const reader = await readerOnly(ctx.organizationId, ctx.readerId);
			await slack(
				reader,
				"chat.postMessage",
				z.object({ ts: z.string() }),
				{ channel, thread_ts: threadTs, text },
				true,
			);
		},
	};
}

export function readAsk(ctx: CardContext, refs: AskRefs): Promise<Ask> {
	if (refs.gmail_thread) return gmailAsk(ctx, refs.gmail_thread);
	return slackAsk(
		ctx,
		refs.slack_channel as string,
		refs.slack_thread_ts as string,
	);
}

/** Replies only when the thread is as the reader saw it, so the reply reaches the people the card listed. */
export async function replyToAsk(
	ctx: CardContext,
	refs: AskRefs,
	seen: string,
	text: string,
): Promise<void> {
	const ask = await readAsk(ctx, refs);
	if (ask.view.version !== seen)
		throw new CardUnavailable("error", THREAD_MOVED);
	await ask.reply(text);
}
