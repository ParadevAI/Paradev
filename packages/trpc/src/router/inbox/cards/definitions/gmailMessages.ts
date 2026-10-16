import type { gmail_v1 } from "@googleapis/gmail";
import { decodeBody, htmlToText } from "../../../../lib/gmail/mime";
import type {
	GmailAddress,
	GmailAttachmentView,
	GmailMessageView,
	GmailRecipients,
} from "../types";
import { blockedByName } from "./attachmentPolicy";
import { proxyEmailImages } from "./emailImages";

/**
 * Gmail's thread payloads to the views the client draws. Pure, so tests and
 * the fixture harness map real payloads through the same code as the card.
 */

/** Gmail clips a message past about 102 KB of HTML; this keeps a card from carrying megabytes of HTML or text. */
export const HTML_CLIP_CHARS = 200_000;

type Part = gmail_v1.Schema$MessagePart;

export function headerOf(part: Part | undefined, name: string): string {
	const lower = name.toLowerCase();
	return (
		part?.headers?.find((h) => h.name?.toLowerCase() === lower)?.value ?? ""
	);
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		return trimmed.slice(1, -1).replace(/\\(.)/g, "$1");
	}
	return trimmed;
}

/** One address from `Name <a@b.c>`, `"Last, First" <a@b.c>` or a bare `a@b.c`. */
export function parseAddress(raw: string): GmailAddress | null {
	const angle = raw.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
	if (angle) {
		const email = (angle[2] ?? "").trim();
		if (!email.includes("@")) return null;
		const name = unquote(angle[1] ?? "");
		return { name: name && name !== email ? name : null, email };
	}
	const email = raw.trim();
	return email.includes("@") ? { name: null, email } : null;
}

/** An address header split on the commas between addresses, not the ones inside quotes or brackets. */
export function parseAddressList(header: string): GmailAddress[] {
	const out: GmailAddress[] = [];
	let current = "";
	let quoted = false;
	let angle = 0;
	for (const char of header) {
		if (char === '"' && !current.endsWith("\\")) quoted = !quoted;
		else if (!quoted && char === "<") angle++;
		else if (!quoted && char === ">") angle = Math.max(0, angle - 1);
		if (char === "," && !quoted && angle === 0) {
			const address = parseAddress(current);
			if (address) out.push(address);
			current = "";
			continue;
		}
		current += char;
	}
	const last = parseAddress(current);
	if (last) out.push(last);
	return out;
}

export function formatAddress(address: GmailAddress): string {
	if (!address.name) return address.email;
	const name = /[",;<>@()[\]:\\]/.test(address.name)
		? `"${address.name.replace(/(["\\])/g, "\\$1")}"`
		: address.name;
	return `${name} <${address.email}>`;
}

interface Found {
	html: string[];
	text: string[];
	attachments: GmailAttachmentView[];
	inline: Map<string, GmailAttachmentView>;
}

function normalizeCid(value: string): string {
	const bare = value.trim().replace(/^<|>$/g, "");
	try {
		return decodeURIComponent(bare).toLowerCase();
	} catch {
		return bare.toLowerCase();
	}
}

function walk(
	part: Part | undefined,
	found: Found,
	fileUrl: (partId: string) => string,
): void {
	if (!part) return;
	const mimeType = part.mimeType ?? "";
	const disposition = headerOf(part, "Content-Disposition").toLowerCase();
	const contentId = normalizeCid(headerOf(part, "Content-ID"));
	const isFile = Boolean(part.body?.attachmentId) || Boolean(part.filename);
	if (isFile && part.partId) {
		const url = fileUrl(part.partId);
		const inlineImage =
			mimeType.startsWith("image/") &&
			contentId &&
			!disposition.startsWith("attachment");
		const file: GmailAttachmentView = {
			partId: part.partId,
			filename: part.filename || "attachment",
			mimeType: mimeType || "application/octet-stream",
			size: part.body?.size ?? 0,
			url,
			blocked: blockedByName(part.filename || ""),
		};
		if (inlineImage) found.inline.set(contentId, file);
		else found.attachments.push(file);
	} else if (mimeType === "text/html" && part.body?.data) {
		found.html.push(decodeBody(part.body.data));
	} else if (mimeType === "text/plain" && part.body?.data) {
		found.text.push(decodeBody(part.body.data));
	}
	for (const child of part.parts ?? []) walk(child, found, fileUrl);
}

export interface MessageContext {
	/** The reader's address and send-as aliases, lowercase, to tell their own messages apart. */
	me: ReadonlySet<string>;
	fileUrl: (messageId: string, partId: string) => string;
	/** Where a remote image in the body is fetched from instead; omitted, the body keeps its own URLs. */
	imageUrl?: (url: string) => string | null;
}

export function toMessageView(
	message: gmail_v1.Schema$Message,
	ctx: MessageContext,
): GmailMessageView {
	const id = message.id ?? "";
	const found: Found = {
		html: [],
		text: [],
		attachments: [],
		inline: new Map(),
	};
	walk(message.payload ?? undefined, found, (partId) =>
		ctx.fileUrl(id, partId),
	);
	let html = found.html.length ? found.html.join("\n") : null;
	const used = new Set<string>();
	if (html && ctx.imageUrl) html = proxyEmailImages(html, ctx.imageUrl);
	if (html) {
		html = html.replace(/(["'(])cid:([^"')\s]+)/gi, (whole, open, cid) => {
			const key = normalizeCid(cid);
			const file = found.inline.get(key);
			if (!file) return whole;
			used.add(key);
			return `${open}${file.url}`;
		});
	}
	const unused = [...found.inline].flatMap(([cid, file]) =>
		used.has(cid) ? [] : [file],
	);
	let text = found.text.length ? found.text.join("\n") : null;
	const clipped = Boolean(
		(html && html.length > HTML_CLIP_CHARS) ||
			(text && text.length > HTML_CLIP_CHARS),
	);
	if (html) html = html.slice(0, HTML_CLIP_CHARS);
	if (text) text = text.slice(0, HTML_CLIP_CHARS);
	const payload = message.payload ?? undefined;
	const from = parseAddress(headerOf(payload, "From")) ?? {
		name: null,
		email: "unknown",
	};
	const labels = new Set(message.labelIds ?? []);
	return {
		id,
		from,
		to: parseAddressList(headerOf(payload, "To")),
		cc: parseAddressList(headerOf(payload, "Cc")),
		bcc: ctx.me.has(from.email.toLowerCase())
			? parseAddressList(headerOf(payload, "Bcc"))
			: [],
		date: new Date(Number(message.internalDate ?? 0)).toISOString(),
		snippet: previewOf(found, html) || decodeEntities(message.snippet ?? ""),
		unread: labels.has("UNREAD"),
		starred: labels.has("STARRED"),
		html,
		text,
		attachments: [...found.attachments, ...unused],
		clipped,
	};
}

const PREVIEW_CHARS = 200;
const QUOTE_START = /^(On .{4,300} wrote:|>)/;

/** Gmail's one-line preview of a folded message: its own words, stopping where the quoted reply begins. */
function previewOf(found: Found, html: string | null): string {
	const text = found.text.length
		? found.text.join("\n")
		: html
			? htmlToText(html)
			: "";
	const own: string[] = [];
	for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
		if (QUOTE_START.test(line.trim())) break;
		own.push(line);
	}
	return own.join(" ").replace(/\s+/g, " ").trim().slice(0, PREVIEW_CHARS);
}

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	"#39": "'",
};

export function decodeEntities(text: string): string {
	return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => {
		return ENTITIES[name] ?? "";
	});
}

function dedupe(
	list: GmailAddress[],
	exclude: ReadonlySet<string>,
): GmailAddress[] {
	const seen = new Set(exclude);
	const out: GmailAddress[] = [];
	for (const address of list) {
		const key = address.email.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(address);
	}
	return out;
}

/**
 * Who Gmail addresses a reply to. Replying to someone else's message goes to
 * its Reply-To or From; replying to your own goes back to the people you sent
 * it to. Reply-all adds everyone else on the message, never yourself.
 */
export function replyRecipients(
	message: gmail_v1.Schema$Message,
	me: ReadonlySet<string>,
): { reply: GmailRecipients; replyAll: GmailRecipients } {
	const payload = message.payload ?? undefined;
	const from = parseAddressList(headerOf(payload, "From"));
	const to = parseAddressList(headerOf(payload, "To"));
	const cc = parseAddressList(headerOf(payload, "Cc"));
	const replyTo = parseAddressList(headerOf(payload, "Reply-To"));
	const mine = from.some((a) => me.has(a.email.toLowerCase()));
	if (mine) {
		const replyTo = dedupe(to, new Set());
		return {
			reply: { to: replyTo, cc: [] },
			replyAll: {
				to: replyTo,
				cc: dedupe(cc, new Set(replyTo.map((a) => a.email.toLowerCase()))),
			},
		};
	}
	const primary = dedupe(replyTo.length ? replyTo : from, new Set());
	const taken = new Set([...me, ...primary.map((a) => a.email.toLowerCase())]);
	const others = dedupe(to, taken);
	const ccTaken = new Set([
		...taken,
		...others.map((a) => a.email.toLowerCase()),
	]);
	return {
		reply: { to: primary, cc: [] },
		replyAll: { to: [...primary, ...others], cc: dedupe(cc, ccTaken) },
	};
}

export function forwardSubject(subject: string): string {
	const trimmed = subject.trim();
	return /^fwd?:/i.test(trimmed) ? trimmed : `Fwd: ${trimmed}`;
}

export function replySubject(subject: string): string {
	const trimmed = subject.trim();
	if (!trimmed) return "Re:";
	return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

const MESSAGE_ID = /<[^<>\s]{1,250}>/g;
const REFERENCES_KEPT = 20;

/** The headers that thread a reply under the message it answers, in Gmail and every other client. */
export function threadingHeaders(message: gmail_v1.Schema$Message): {
	inReplyTo: string;
	references: string;
} | null {
	const payload = message.payload ?? undefined;
	const messageId = headerOf(payload, "Message-ID").match(MESSAGE_ID)?.[0];
	if (!messageId) return null;
	const earlier = headerOf(payload, "References").match(MESSAGE_ID) ?? [];
	const chain = [...earlier, messageId];
	const kept =
		chain.length > REFERENCES_KEPT
			? [chain[0] as string, ...chain.slice(-(REFERENCES_KEPT - 1))]
			: chain;
	return { inReplyTo: messageId, references: kept.join(" ") };
}
