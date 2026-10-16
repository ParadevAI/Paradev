import type { gmail_v1 } from "@googleapis/gmail";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	type Attachment,
	encodeRaw,
	htmlToText,
} from "../../../../lib/gmail/mime";
import { publishCloudWorkspaceJob } from "../../../cloud-workspace/jobs";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type GmailAddress,
	type GmailEmailView,
	type GmailLabelView,
	type GmailMessageView,
	withInput,
} from "../types";
import { isArchive } from "./attachmentPolicy";
import { emailImageUrl } from "./emailImages";
import { gmailFor, notFound, reconnectOnAuthError } from "./gmailClient";
import {
	attachmentBytes,
	blockedReason,
	EMAIL_BYTES_MAX,
	type SaveDraftInput,
	type SendAs,
	saveDraftSchema,
	uploadedAttachments,
} from "./gmailDraft";
import { findPart, gmailFileUrl, partBlocked } from "./gmailFiles";
import {
	formatAddress,
	forwardSubject,
	headerOf,
	parseAddressList,
	replyRecipients,
	replySubject,
	threadingHeaders,
	toMessageView,
} from "./gmailMessages";
import { forwardBody, quoteReply, toEmailFields } from "./gmailReply";
import { SCHEDULE_DAYS_MAX, sendScheduledDraft } from "./gmailSchedule";

export const GMAIL_ID = /^[a-f0-9]{8,32}$/i;
const DRAFT_ID = /^r-?[0-9]{6,32}$/;
const ACCOUNT_TTL_MS = 10 * 60_000;
const ACCOUNT_CACHE_MAX = 500;
const NEEDS_SEND_SCOPE = "Reconnect Google to send and archive from Superset";
const DRAFT_GONE = "That draft was sent or deleted";
/** System labels Gmail shows beside a subject; the rest (categories, UNREAD, SENT) stay hidden there too. */
const SHOWN_SYSTEM_LABELS: Record<string, string> = { INBOX: "Inbox" };

const refsSchema = z
	.object({
		/** The thread to reply in. A draft that is already a reply names its own thread. */
		thread: z.string().regex(GMAIL_ID).optional(),
		/** The Gmail draft the agent wrote: the reply, or a new email with its recipients and subject. */
		draft: z.string().regex(DRAFT_ID).optional(),
		/** Start a reply as reply-all when the draft does not name its recipients. */
		reply_all: z.boolean().optional(),
		/** The mailbox the thread and draft are in; a reader with another mailbox gets no access. */
		account: z.string().trim().email().max(320).optional(),
		/** When the reader scheduled the draft to go out; set by `schedule_send`. */
		scheduled: z.string().datetime().optional(),
	})
	.refine((refs) => refs.thread || refs.draft, {
		message: "Name a thread to reply in, or a draft to send",
	});
type Refs = z.infer<typeof refsSchema>;

interface Data {
	threadId: string | null;
	draftId: string | null;
	draftGone: boolean;
	subject: string;
	/** The send-as address the reply goes out from, when it is not the primary one. */
	from: string | null;
	canSend: boolean;
	canArchive: boolean;
}

interface Account {
	at: number;
	me: Set<string>;
	email: string;
	sendAs: SendAs[];
	labels: Map<string, GmailLabelView>;
}

const accountCache = new Map<string, Account>();

/** The reader's address and send-as aliases, and their labels; both change rarely. */
async function accountOf(
	connectionId: string,
	client: gmail_v1.Gmail,
): Promise<Account> {
	const cached = accountCache.get(connectionId);
	if (cached && Date.now() - cached.at < ACCOUNT_TTL_MS) return cached;
	let complete = true;
	const partial = <T>(): T[] => {
		complete = false;
		return [];
	};
	const [profile, aliases, labels] = await Promise.all([
		client.users.getProfile({ userId: "me" }).then((r) => r.data),
		client.users.settings.sendAs
			.list({ userId: "me" })
			.then((r) => r.data.sendAs ?? [])
			.catch(() => partial<gmail_v1.Schema$SendAs>()),
		client.users.labels
			.list({ userId: "me" })
			.then((r) => r.data.labels ?? [])
			.catch(() => partial<gmail_v1.Schema$Label>()),
	]);
	const email = profile.emailAddress ?? "";
	const sendAs = aliases.flatMap((alias): SendAs[] =>
		alias.sendAsEmail &&
		(alias.isPrimary || alias.verificationStatus === "accepted")
			? [
					{
						email: alias.sendAsEmail,
						name: alias.displayName || null,
						isDefault: Boolean(alias.isDefault),
						signature: alias.signature ?? "",
					},
				]
			: [],
	);
	const me = new Set(
		[email, ...sendAs.map((alias) => alias.email)]
			.filter(Boolean)
			.map((e) => e.toLowerCase()),
	);
	const byId = new Map<string, GmailLabelView>();
	for (const label of labels) {
		if (!label.id || !label.name) continue;
		const shown = SHOWN_SYSTEM_LABELS[label.id];
		if (label.type === "system" && !shown) continue;
		byId.set(label.id, {
			id: label.id,
			name: shown ?? label.name,
			color:
				label.color?.backgroundColor && label.color.textColor
					? {
							background: label.color.backgroundColor,
							text: label.color.textColor,
						}
					: null,
		});
	}
	const entry = { at: Date.now(), me, email, sendAs, labels: byId };
	if (!complete) return entry;
	if (accountCache.size >= ACCOUNT_CACHE_MAX) {
		const oldest = accountCache.keys().next().value;
		if (oldest) accountCache.delete(oldest);
	}
	accountCache.set(connectionId, entry);
	return entry;
}

/**
 * Gmail sends from the alias the answered message reached, or the one the
 * draft names; the primary address needs no header.
 */
function sendFrom(account: Account, candidates: GmailAddress[]): string | null {
	const alias = sendingAlias(account, candidates);
	return alias ? formatAddress({ name: alias.name, email: alias.email }) : null;
}

function sendingAlias(
	account: Account,
	candidates: GmailAddress[],
): SendAs | null {
	const primary = account.email.toLowerCase();
	for (const candidate of candidates) {
		const key = candidate.email.toLowerCase();
		if (key === primary) return null;
		const alias = account.sendAs.find((a) => a.email.toLowerCase() === key);
		if (alias) return alias;
	}
	return null;
}

/** A From the reader picked, when it is one of their own addresses. */
function chosenFrom(
	account: Account,
	email: string | undefined,
): string | null {
	if (!email || email.toLowerCase() === account.email.toLowerCase())
		return null;
	const alias = account.sendAs.find(
		(a) => a.email.toLowerCase() === email.toLowerCase(),
	);
	if (!alias)
		throw new CardUnavailable("error", "That From address isn't yours");
	return formatAddress({ name: alias.name, email: alias.email });
}

async function fetchThread(
	client: gmail_v1.Gmail,
	id: string,
): Promise<gmail_v1.Schema$Thread> {
	try {
		return (
			await client.users.threads.get({ userId: "me", id, format: "full" })
		).data;
	} catch (error) {
		if (notFound(error))
			throw new CardUnavailable("gone", "That thread is not in your mailbox");
		reconnectOnAuthError(error);
	}
}

/** The agent's draft, or null once it was sent or deleted and the card still has its thread to show. */
async function fetchDraft(
	client: gmail_v1.Gmail,
	id: string,
	hasThread: boolean,
): Promise<gmail_v1.Schema$Draft | null> {
	try {
		return (await client.users.drafts.get({ userId: "me", id, format: "full" }))
			.data;
	} catch (error) {
		if (notFound(error)) {
			if (hasThread) return null;
			throw new CardUnavailable("gone", DRAFT_GONE);
		}
		reconnectOnAuthError(error);
	}
}

/** The draft's files with their bytes, to go out again when the reader's edit replaces the draft's body. */
async function draftAttachments(
	client: gmail_v1.Gmail,
	message: gmail_v1.Schema$Message | undefined,
): Promise<(Attachment & { partId: string })[]> {
	const messageId = message?.id;
	if (!messageId) return [];
	const parts: gmail_v1.Schema$MessagePart[] = [];
	const collect = (part: gmail_v1.Schema$MessagePart | undefined) => {
		if (!part) return;
		if (part.filename && (part.body?.attachmentId || part.body?.data))
			parts.push(part);
		for (const child of part.parts ?? []) collect(child);
	};
	collect(message.payload ?? undefined);
	return Promise.all(
		parts.map(async (part) => {
			const data =
				part.body?.data ??
				(
					await client.users.messages.attachments.get({
						userId: "me",
						messageId,
						id: part.body?.attachmentId ?? "",
					})
				).data.data ??
				"";
			return {
				partId: part.partId ?? "",
				filename: part.filename ?? "attachment",
				mimeType: part.mimeType ?? "application/octet-stream",
				content: Buffer.from(data, "base64url").toString("base64"),
			};
		}),
	);
}

/** Drafts sit in the thread in Gmail too; the card's reply box is the draft being written. */
function sentMessages(
	thread: gmail_v1.Schema$Thread,
): gmail_v1.Schema$Message[] {
	return (thread.messages ?? []).filter(
		(m) => !(m.labelIds ?? []).includes("DRAFT"),
	);
}

/** A draft's body as the composer opens it: its plain text, or its HTML read as text. */
function draftBody(message: gmail_v1.Schema$Message | undefined): string {
	if (!message) return "";
	const view = toMessageView(message, { me: new Set(), fileUrl: () => "" });
	return (view.text ?? (view.html ? htmlToText(view.html) : "")).trim();
}

/** Archives are blocked by what they hold, which only their bytes tell. */
async function withArchiveVerdicts(
	client: gmail_v1.Gmail,
	message: gmail_v1.Schema$Message,
	view: GmailMessageView,
): Promise<GmailMessageView> {
	if (!view.attachments.some((a) => !a.blocked && isArchive(a.filename)))
		return view;
	const attachments = await Promise.all(
		view.attachments.map(async (attachment) => {
			const part = findPart(message.payload ?? undefined, attachment.partId);
			if (attachment.blocked || !part || !isArchive(attachment.filename))
				return attachment;
			return {
				...attachment,
				blocked: await partBlocked(client, message.id ?? "", part),
			};
		}),
	);
	return { ...view, attachments };
}

/** The agent's draft is the card's to clean up once the reader decides nothing goes out. */
async function deleteDraft(
	data: Data,
	ctx: { organizationId: string; readerId: string },
): Promise<boolean> {
	if (!data.draftId || !data.canSend) return false;
	const { client } = await gmailFor(ctx.organizationId, ctx.readerId);
	return client.users.drafts
		.delete({ userId: "me", id: data.draftId })
		.then(() => true)
		.catch((error: unknown) => {
			if (notFound(error)) return false;
			reconnectOnAuthError(error);
		});
}

/** The reader's Superset photo, drawn on their own messages as Gmail draws their Google one. */
async function readerPhoto(readerId: string): Promise<string | null> {
	const row = await db.query.users.findFirst({
		where: eq(users.id, readerId),
		columns: { image: true },
	});
	return row?.image ?? null;
}

type Threading = { threadId: string; inReplyTo: string; references: string };

/** The body, subject and threading of what goes out: a reply quoting, or a forward carrying, the message it answers. */
async function outgoingMessage(
	client: gmail_v1.Gmail,
	data: Data,
	input: SaveDraftInput,
): Promise<{
	body: { html: string; text: string };
	subject: string;
	threading: Threading | null;
	forwarded: Attachment[];
}> {
	const plain = {
		body: { html: input.html, text: input.text },
		subject: input.subject || data.subject,
		threading: null,
		forwarded: [],
	};
	if (!data.threadId) return plain;
	const sent = sentMessages(await fetchThread(client, data.threadId));
	const target = sent.find((m) => m.id === input.of) ?? sent.at(-1);
	if (!target) return plain;
	const headers = threadingHeaders(target);
	const threading = headers ? { threadId: data.threadId, ...headers } : null;
	const original = toMessageView(target, { me: new Set(), fileUrl: () => "" });
	if (input.mode === "forward") {
		return {
			body: forwardBody(input, original, {
				date: headerOf(target.payload ?? undefined, "Date"),
				subject: data.subject,
			}),
			subject: input.subject || forwardSubject(data.subject),
			threading,
			forwarded: (await draftAttachments(client, target)).map(
				({ partId: _partId, ...file }) => file,
			),
		};
	}
	return {
		body: quoteReply(input, original),
		subject: input.subject || replySubject(data.subject),
		threading,
		forwarded: [],
	};
}

/** The files that go out: the draft's kept files, the reader's uploads and any forwarded ones, within Gmail's rules. A saved draft may keep a blocked file, as in Gmail; only sending refuses it. */
async function outgoingFiles(
	client: gmail_v1.Gmail,
	ctx: { organizationId: string; readerId: string },
	draft: gmail_v1.Schema$Message | undefined,
	input: SaveDraftInput,
	forwarded: Attachment[] = [],
	sending = true,
): Promise<Attachment[]> {
	const kept = (await draftAttachments(client, draft))
		.filter((file) => !input.keep || input.keep.includes(file.partId))
		.map(({ partId: _partId, ...file }) => file);
	const added = await uploadedAttachments({
		organizationId: ctx.organizationId,
		userId: ctx.readerId,
		fileIds: input.uploads,
	});
	const attachments = [...kept, ...added, ...forwarded];
	for (const file of sending ? attachments : []) {
		const reason = blockedReason(file);
		if (reason) throw new CardUnavailable("error", reason);
	}
	if (attachmentBytes(attachments) > EMAIL_BYTES_MAX) {
		throw new CardUnavailable(
			"error",
			"Gmail sends at most 25 MB in one email; larger files go through Google Drive, which Superset can't reach",
		);
	}
	return attachments;
}

/** Saves the reader's edits to the Gmail draft, creating it when there is none. `final` writes what Send would send, quote or forward included. */
async function writeDraft(
	data: Data,
	ctx: { organizationId: string; readerId: string },
	input: SaveDraftInput,
	final = false,
): Promise<string> {
	const { client, connectionId } = await gmailFor(
		ctx.organizationId,
		ctx.readerId,
	);
	const account = await accountOf(connectionId, client);
	const draft = data.draftId
		? await fetchDraft(client, data.draftId, Boolean(data.threadId))
		: null;
	if (data.draftId && !draft) throw new CardUnavailable("gone", DRAFT_GONE);
	let { body, subject, threading, forwarded } = await outgoingMessage(
		client,
		data,
		input,
	);
	if (!final) {
		body = { html: input.html, text: input.text };
		subject =
			input.subject || (data.threadId ? replySubject(data.subject) : "");
		forwarded = [];
	}
	const attachments = await outgoingFiles(
		client,
		ctx,
		draft?.message ?? undefined,
		input,
		forwarded,
		final,
	);
	const from = chosenFrom(account, input.from) ?? data.from;
	const message = {
		raw: encodeRaw(
			toEmailFields(input, body, threading, subject, {
				attachments,
				...(from ? { from } : {}),
			}),
		),
		...(data.threadId ? { threadId: data.threadId } : {}),
	};
	try {
		if (data.draftId) {
			await client.users.drafts.update({
				userId: "me",
				id: data.draftId,
				requestBody: { id: data.draftId, message },
			});
			return data.draftId;
		}
		const created = await client.users.drafts.create({
			userId: "me",
			requestBody: { message },
		});
		return created.data.id ?? "";
	} catch (error) {
		if (data.draftId && notFound(error))
			throw new CardUnavailable("gone", DRAFT_GONE);
		reconnectOnAuthError(error);
	}
}

function describeSendError(error: z.ZodError): string {
	const issue = error.issues[0];
	if (
		issue?.code === "too_big" &&
		["html", "text"].includes(String(issue.path[0]))
	)
		return "That email is too long to send from here";
	if (issue && ["to", "cc", "bcc"].includes(String(issue.path[0])))
		return "One of the recipients is not an email address";
	return "That email could not be read";
}

/**
 * An email for the reader to send: a reply in a thread, drawn as Gmail draws
 * the thread with the agent's Gmail draft in the reply box, or a new email
 * in Gmail's compose window. It goes out as the reader through their own
 * Google account, threaded under the message it answers.
 */
export const gmailEmail = defineCard<Refs, Data>({
	type: "gmail.email",
	label: "Email",
	ask: "Send email",
	brand: "gmail",
	refs: refsSchema,
	async resolve({ refs, ctx }) {
		const { client, connectionId, canSend, canArchive } = await gmailFor(
			ctx.organizationId,
			ctx.readerId,
		);
		let account: Account;
		const photo = readerPhoto(ctx.readerId).catch(() => null);
		try {
			account = await accountOf(connectionId, client);
		} catch (error) {
			reconnectOnAuthError(error);
		}
		if (refs.account && !account.me.has(refs.account.toLowerCase())) {
			throw new CardUnavailable(
				"no_access",
				"This email is in another Gmail account",
			);
		}
		const draft = refs.draft
			? await fetchDraft(client, refs.draft, Boolean(refs.thread))
			: null;
		const draftGone = Boolean(refs.draft) && !draft;
		const fileUrl = (messageId: string, partId: string) =>
			gmailFileUrl(ctx.organizationId, ctx.readerId, messageId, partId);
		const draftMessage = draft?.message ?? undefined;
		const draftPayload = draftMessage?.payload ?? undefined;
		const threadId = refs.thread ?? draftMessage?.threadId ?? null;
		const draftView = draftMessage
			? await withArchiveVerdicts(
					client,
					draftMessage,
					toMessageView(draftMessage, {
						me: account.me,
						fileUrl,
						imageUrl: emailImageUrl,
					}),
				)
			: null;
		const written = {
			to: parseAddressList(headerOf(draftPayload, "To")),
			cc: parseAddressList(headerOf(draftPayload, "Cc")),
			bcc: parseAddressList(headerOf(draftPayload, "Bcc")),
			subject: headerOf(draftPayload, "Subject"),
			body: draftBody(draftMessage),
			html: draftView?.html ?? null,
			attachments: draftView?.attachments ?? [],
		};
		const draftFrom = parseAddressList(headerOf(draftPayload, "From"));
		const data = (subject: string, from: string | null): Data => ({
			threadId,
			draftId: draft ? (refs.draft ?? null) : null,
			draftGone,
			subject,
			from,
			canSend,
			canArchive,
		});

		const thread = threadId ? await fetchThread(client, threadId) : null;
		const sent = thread ? sentMessages(thread) : [];
		if (!thread || sent.length === 0) {
			const view: GmailEmailView = {
				kind: "gmail.email",
				mode: "compose",
				account: { email: account.email, photo: await photo },
				canSend,
				draftGone,
				scheduledAt: refs.scheduled ?? null,
				sendAs: account.sendAs,
				thread: null,
				draft: {
					...written,
					replyAll: false,
					from: sendingAlias(account, draftFrom)?.email ?? account.email,
				},
			};
			const fields: CardField[] = [
				{ label: "To", value: written.to.map(formatAddress).join(", ") },
				{ label: "Subject", value: written.subject || "(no subject)" },
			];
			return {
				title: written.subject || "New email",
				subtitle: written.to[0]?.name ?? written.to[0]?.email,
				fields,
				body: written.body.slice(0, 500) || undefined,
				view,
				data: data(written.subject, sendFrom(account, draftFrom)),
			};
		}

		const last = sent[sent.length - 1] as gmail_v1.Schema$Message;
		const subject =
			headerOf(sent[0]?.payload ?? undefined, "Subject") || "(no subject)";
		const messages = await Promise.all(
			sent.map((m) =>
				withArchiveVerdicts(
					client,
					m,
					toMessageView(m, {
						me: account.me,
						fileUrl,
						imageUrl: emailImageUrl,
					}),
				),
			),
		);
		const labelIds = new Set(sent.flatMap((m) => m.labelIds ?? []));
		const labels = [...labelIds].flatMap((id) => {
			const label = account.labels.get(id);
			return label ? [label] : [];
		});
		const { reply, replyAll } = replyRecipients(last, account.me);
		const named = written.to.length + written.cc.length > 0;
		const startAll = refs.reply_all ?? false;
		const chosen = startAll ? replyAll : reply;
		const view: GmailEmailView = {
			kind: "gmail.email",
			mode: "reply",
			account: { email: account.email, photo: await photo },
			canSend,
			draftGone,
			scheduledAt: refs.scheduled ?? null,
			sendAs: account.sendAs,
			thread: {
				id: threadId as string,
				subject,
				labels,
				messages,
				reply,
				replyAll,
			},
			draft: {
				to: named ? written.to : chosen.to,
				cc: named ? written.cc : chosen.cc,
				bcc: written.bcc,
				subject: written.subject || replySubject(subject),
				body: written.body,
				html: written.html,
				replyAll: startAll,
				from:
					sendingAlias(account, [
						...draftFrom,
						...(messages.at(-1)
							? [...(messages.at(-1)?.to ?? []), ...(messages.at(-1)?.cc ?? [])]
							: []),
					])?.email ?? account.email,
				attachments: written.attachments,
			},
		};
		const lastView = messages[messages.length - 1];
		const fields: CardField[] = [
			{ label: "From", value: lastView ? formatAddress(lastView.from) : "" },
			{ label: "Messages", value: String(messages.length) },
		];
		return {
			title: subject,
			subtitle: lastView?.from.name ?? lastView?.from.email,
			fields,
			body: lastView?.snippet,
			view,
			data: data(
				subject,
				sendFrom(account, [
					...draftFrom,
					...(lastView
						? [...lastView.to, ...lastView.cc, ...lastView.bcc]
						: []),
				]),
			),
		};
	},
	actions: {
		send: {
			label: () => "Send",
			style: "primary",
			role: "primary",
			available: (data) =>
				data.draftGone ? DRAFT_GONE : data.canSend || NEEDS_SEND_SCOPE,
			run: withInput(
				saveDraftSchema,
				async ({ refs, data, ctx, input: parsed }) => {
					if (data.draftGone) throw new CardUnavailable("gone", DRAFT_GONE);
					if (parsed.to.length + parsed.cc.length + parsed.bcc.length === 0) {
						throw new CardUnavailable("error", "Add someone to send it to");
					}
					const { client, connectionId } = await gmailFor(
						ctx.organizationId,
						ctx.readerId,
					);
					const account = await accountOf(connectionId, client);
					const from = chosenFrom(account, parsed.from) ?? data.from;
					const { body, subject, threading, forwarded } = await outgoingMessage(
						client,
						data,
						parsed,
					);
					let posted: gmail_v1.Schema$Message | null = null;
					try {
						const draft = data.draftId
							? await fetchDraft(client, data.draftId, true)
							: null;
						if (data.draftId && !draft) {
							throw new CardUnavailable("gone", DRAFT_GONE);
						}
						const attachments = await outgoingFiles(
							client,
							ctx,
							draft?.message ?? undefined,
							parsed,
							forwarded,
						);
						const message = {
							raw: encodeRaw(
								toEmailFields(parsed, body, threading, subject, {
									attachments,
									...(from ? { from } : {}),
								}),
							),
							...(data.threadId ? { threadId: data.threadId } : {}),
						};
						if (data.draftId) {
							await client.users.drafts.update({
								userId: "me",
								id: data.draftId,
								requestBody: { id: data.draftId, message },
							});
							({ data: posted } = await client.users.drafts.send({
								userId: "me",
								requestBody: { id: data.draftId },
							}));
						} else {
							({ data: posted } = await client.users.messages.send({
								userId: "me",
								requestBody: message,
							}));
						}
					} catch (error) {
						if (error instanceof CardUnavailable) throw error;
						if (data.draftId && notFound(error))
							throw new CardUnavailable("gone", DRAFT_GONE);
						reconnectOnAuthError(error);
					}
					return {
						outcome: {
							sent: true,
							messageId: posted?.id ?? null,
							threadId: posted?.threadId ?? null,
						},
						notice: { tone: "good", text: "Sent" },
						...(!refs.thread && posted?.threadId
							? { refs: { thread: posted.threadId } }
							: {}),
					};
				},
				describeSendError,
			),
		},
		compose: {
			label: () => "Send new email",
			style: "secondary",
			role: "other",
			terminal: false,
			available: (data) => data.canSend || NEEDS_SEND_SCOPE,
			run: withInput(
				saveDraftSchema,
				async ({ data, ctx, input: parsed }) => {
					if (parsed.to.length + parsed.cc.length + parsed.bcc.length === 0) {
						throw new CardUnavailable("error", "Add someone to send it to");
					}
					const { client, connectionId } = await gmailFor(
						ctx.organizationId,
						ctx.readerId,
					);
					const account = await accountOf(connectionId, client);
					const from = chosenFrom(account, parsed.from) ?? data.from;
					const { body, subject, threading, forwarded } = parsed.of
						? await outgoingMessage(client, data, parsed)
						: {
								body: { html: parsed.html, text: parsed.text },
								subject: parsed.subject,
								threading: null,
								forwarded: [],
							};
					const attachments = await outgoingFiles(
						client,
						ctx,
						undefined,
						parsed,
						forwarded,
					);
					let posted: gmail_v1.Schema$Message | null = null;
					try {
						({ data: posted } = await client.users.messages.send({
							userId: "me",
							requestBody: {
								raw: encodeRaw(
									toEmailFields(parsed, body, threading, subject, {
										attachments,
										...(from ? { from } : {}),
									}),
								),
								...(threading ? { threadId: threading.threadId } : {}),
							},
						}));
					} catch (error) {
						reconnectOnAuthError(error);
					}
					return {
						outcome: {
							composed: true,
							messageId: posted?.id ?? null,
							threadId: posted?.threadId ?? null,
						},
						notice: { tone: "good", text: "Sent" },
					};
				},
				describeSendError,
			),
		},
		save_draft: {
			label: () => "Save draft",
			style: "secondary",
			role: "other",
			terminal: false,
			available: (data) =>
				data.draftGone ? DRAFT_GONE : data.canSend || NEEDS_SEND_SCOPE,
			run: withInput(
				saveDraftSchema,
				async ({ refs, data, ctx, input }) => {
					const draftId = await writeDraft(data, ctx, input);
					return {
						outcome: { saved: true, draftId },
						...(refs.draft !== draftId ? { refs: { draft: draftId } } : {}),
					};
				},
				describeSendError,
			),
		},
		schedule_send: {
			label: () => "Schedule send",
			style: "secondary",
			role: "other",
			available: (data) =>
				data.draftGone ? DRAFT_GONE : data.canSend || NEEDS_SEND_SCOPE,
			run: withInput(
				saveDraftSchema.extend({ at: z.string().datetime() }),
				async ({ data, ctx, input }) => {
					if (input.to.length + input.cc.length + input.bcc.length === 0) {
						throw new CardUnavailable("error", "Add someone to send it to");
					}
					const delaySeconds = Math.round(
						(Date.parse(input.at) - Date.now()) / 1000,
					);
					if (delaySeconds < 60) {
						throw new CardUnavailable(
							"error",
							"Pick a time at least a minute from now",
						);
					}
					if (delaySeconds > SCHEDULE_DAYS_MAX * 86_400) {
						throw new CardUnavailable(
							"error",
							`Superset can schedule up to ${SCHEDULE_DAYS_MAX} days ahead`,
						);
					}
					const draftId = await writeDraft(data, ctx, input, true);
					await publishCloudWorkspaceJob({
						path: "/api/inbox/gmail-scheduled",
						body: {
							organizationId: ctx.organizationId,
							readerId: ctx.readerId,
							draftId,
						},
						delaySeconds,
						runLocally: sendScheduledDraft,
					});
					return {
						outcome: { scheduled: input.at, draftId },
						notice: { tone: "good", text: "Send scheduled" },
						refs: { draft: draftId, scheduled: input.at },
					};
				},
				describeSendError,
			),
		},
		star: {
			label: () => "Star",
			style: "secondary",
			role: "other",
			terminal: false,
			available: (data) =>
				!data.threadId
					? "A new email has nothing to star"
					: data.canArchive || NEEDS_SEND_SCOPE,
			run: withInput(
				z.object({
					message: z.string().regex(GMAIL_ID),
					starred: z.boolean(),
				}),
				async ({ ctx, input }) => {
					const { client } = await gmailFor(ctx.organizationId, ctx.readerId);
					try {
						await client.users.messages.modify({
							userId: "me",
							id: input.message,
							requestBody: input.starred
								? { addLabelIds: ["STARRED"] }
								: { removeLabelIds: ["STARRED"] },
						});
					} catch (error) {
						if (notFound(error))
							throw new CardUnavailable("error", "That message is gone");
						reconnectOnAuthError(error);
					}
					return {
						outcome: { starred: input.starred, message: input.message },
					};
				},
			),
		},
		remove_label: {
			label: () => "Remove label",
			style: "secondary",
			role: "other",
			terminal: false,
			available: (data) =>
				!data.threadId
					? "A new email has no labels"
					: data.canArchive || NEEDS_SEND_SCOPE,
			run: withInput(
				z.string().min(1).max(200),
				async ({ data, ctx, input }) => {
					if (!data.threadId)
						throw new CardUnavailable("error", "No thread to change");
					const { client } = await gmailFor(ctx.organizationId, ctx.readerId);
					try {
						await client.users.threads.modify({
							userId: "me",
							id: data.threadId,
							requestBody: { removeLabelIds: [input] },
						});
					} catch (error) {
						if (notFound(error))
							throw new CardUnavailable("gone", "That thread is gone");
						reconnectOnAuthError(error);
					}
					return { outcome: { removedLabel: input } };
				},
			),
		},
		archive: {
			label: () => "Archive",
			style: "secondary",
			role: "other",
			available: (data) =>
				!data.threadId
					? "A new email has no thread to archive"
					: data.canArchive || NEEDS_SEND_SCOPE,
			async run({ data, ctx }) {
				if (!data.threadId)
					throw new CardUnavailable("error", "No thread to archive");
				const { client } = await gmailFor(ctx.organizationId, ctx.readerId);
				try {
					await client.users.threads.modify({
						userId: "me",
						id: data.threadId,
						requestBody: { removeLabelIds: ["INBOX"] },
					});
				} catch (error) {
					if (notFound(error))
						throw new CardUnavailable("gone", "That thread is gone");
					reconnectOnAuthError(error);
				}
				return {
					outcome: { archived: true },
					notice: { tone: "done", text: "Archived" },
				};
			},
		},
		discard: {
			label: () => "Discard draft",
			style: "secondary",
			role: "other",
			available: (data) =>
				!data.draftId
					? "There is no draft to discard"
					: data.canSend || NEEDS_SEND_SCOPE,
			async run({ data, ctx }) {
				const discarded = await deleteDraft(data, ctx);
				return { outcome: { sent: false, discarded } };
			},
		},
		nothing: {
			label: () => "This is nothing",
			style: "secondary",
			role: "dismiss",
			async run({ data, ctx }) {
				const draftDeleted = await deleteDraft(data, ctx);
				return { outcome: { classified: "nothing", draftDeleted } };
			},
		},
	},
});
