import { z } from "zod";
import { type EmailFields, htmlToText } from "../../../../lib/gmail/mime";
import type { GmailAddress, GmailMessageView } from "../types";
import { formatAddress, parseAddress } from "./gmailMessages";

const RECIPIENTS_MAX = 100;
/** The act input caps the JSON at 100k characters; both bodies must fit in it together. */
const BODY_MAX = 40_000;
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

const address = z
	.string()
	.trim()
	.max(320)
	.refine(
		(value) => {
			if (/[\r\n]/.test(value)) return false;
			const parsed = parseAddress(value);
			return parsed !== null && EMAIL.test(parsed.email);
		},
		{ message: "Not an email address" },
	);

/** What the composer sends: the edited recipients and the reply, as HTML and as text. */
export const sendInputSchema = z.object({
	to: z.array(address).max(RECIPIENTS_MAX),
	cc: z.array(address).max(RECIPIENTS_MAX).default([]),
	bcc: z.array(address).max(RECIPIENTS_MAX).default([]),
	subject: z
		.string()
		.max(998)
		.refine((value) => !/[\r\n]/.test(value))
		.default(""),
	html: z.string().max(BODY_MAX),
	text: z.string().max(BODY_MAX),
	/** "On Thu, Oct 2, 2026 at 3:04 PM Avery wrote:", written by the client in the reader's language. */
	attribution: z.string().max(400).optional(),
	/** One of the reader's send-as addresses; the primary when absent. */
	from: z.string().trim().email().max(320).optional(),
	/** A reply quotes the message it answers; a forward carries it whole, with its files. */
	mode: z.enum(["reply", "forward"]).default("reply"),
	/** The message answered or forwarded; the thread's last when absent. */
	of: z
		.string()
		.regex(/^[a-f0-9]{8,32}$/i)
		.optional(),
});
export type SendInput = z.infer<typeof sendInputSchema>;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
	return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

/** The answered message quoted under the reply, marked up the way Gmail marks it so clients fold it. */
export function quoteReply(
	input: Pick<SendInput, "html" | "text" | "attribution">,
	original: GmailMessageView,
): { html: string; text: string } {
	const attribution =
		input.attribution?.trim() || `${formatAddress(original.from)} wrote:`;
	const originalText =
		original.text ??
		(original.html ? htmlToText(original.html) : original.snippet);
	const originalHtml =
		original.html && !original.clipped
			? original.html.replace(/<img\b[^>]*\bsrc=["']?cid:[^>]*>/gi, "")
			: textToHtml(originalText);
	const html = `${input.html}<br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">${escapeHtml(attribution)}<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${originalHtml}</blockquote></div>`;
	const quoted = originalText
		.split(/\r?\n/)
		.map((line) => (line ? `> ${line}` : ">"))
		.join("\n");
	return { html, text: `${input.text}\n\n${attribution}\n${quoted}\n` };
}

/** The forwarded message under the reader's note, headed the way Gmail heads it. */
export function forwardBody(
	input: Pick<SendInput, "html" | "text">,
	original: GmailMessageView,
	header: { date: string; subject: string },
): { html: string; text: string } {
	const list = (addresses: GmailAddress[]) =>
		addresses.map(formatAddress).join(", ");
	const headers: [string, string][] = [
		["From", formatAddress(original.from)],
		["Date", header.date],
		["Subject", header.subject],
		["To", list(original.to)],
		...(original.cc.length > 0
			? ([["Cc", list(original.cc)]] as [string, string][])
			: []),
	];
	const originalText =
		original.text ??
		(original.html ? htmlToText(original.html) : original.snippet);
	const originalHtml =
		original.html && !original.clipped
			? original.html.replace(/<img\b[^>]*\bsrc=["']?cid:[^>]*>/gi, "")
			: textToHtml(originalText);
	const headerHtml = headers
		.map(([name, value]) => `${name}: ${escapeHtml(value)}<br>`)
		.join("");
	const html = `${input.html}<br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>${headerHtml}</div><br><br>${originalHtml}</div>`;
	const text = `${input.text}\n\n---------- Forwarded message ---------\n${headers.map(([name, value]) => `${name}: ${value}`).join("\n")}\n\n${originalText}\n`;
	return { html, text };
}

export function toEmailFields(
	input: SendInput,
	body: { html: string; text: string },
	threading: { threadId: string; inReplyTo: string; references: string } | null,
	subject: string,
	extra: Pick<EmailFields, "from" | "attachments"> = { attachments: [] },
): EmailFields {
	const list = (values: string[]) =>
		values.map((value) => formatAddress(parseAddress(value) as GmailAddress));
	return {
		to: list(input.to),
		cc: list(input.cc),
		bcc: list(input.bcc),
		subject,
		body: body.text,
		htmlBody: body.html,
		...extra,
		...(threading
			? {
					threadId: threading.threadId,
					inReplyTo: threading.inReplyTo,
					references: threading.references,
				}
			: {}),
	};
}
