import {
	decodeBody,
	type EmailFields,
	headerSafe,
	htmlToText,
	normalizeText,
} from "../../../../lib/gmail/mime";
import { stringList } from "./api";

export {
	type Attachment,
	buildMime,
	decodeBody,
	type EmailFields,
	encodeRaw,
	htmlToText,
	normalizeText,
} from "../../../../lib/gmail/mime";

export function readEmailFields(args: Record<string, unknown>): EmailFields {
	const attachments = Array.isArray(args.attachments)
		? (args.attachments as Record<string, unknown>[]).map((entry) => {
				const filename = String(entry.filename ?? "").trim();
				const content = String(entry.content ?? "").trim();
				if (!filename || !content) {
					throw new Error("each attachment needs a filename and content");
				}
				return {
					filename: headerSafe(filename, "attachment filename"),
					content,
					...(entry.mimeType
						? {
								mimeType: headerSafe(
									String(entry.mimeType),
									"attachment mimeType",
								),
							}
						: {}),
				};
			})
		: [];

	const recipients = (value: unknown, field: string) =>
		stringList(value, field).map((entry) => headerSafe(entry, field));

	return {
		to: recipients(args.to, "to"),
		cc: recipients(args.cc, "cc"),
		bcc: recipients(args.bcc, "bcc"),
		subject: headerSafe(String(args.subject ?? ""), "subject"),
		body: String(args.body ?? ""),
		...(args.htmlBody ? { htmlBody: String(args.htmlBody) } : {}),
		attachments,
		...(args.inReplyTo
			? { inReplyTo: headerSafe(String(args.inReplyTo), "inReplyTo") }
			: {}),
		...(args.references
			? { references: headerSafe(String(args.references), "references") }
			: {}),
		...(args.threadId ? { threadId: String(args.threadId) } : {}),
	};
}

export interface MessagePart {
	mimeType?: string;
	filename?: string;
	body?: { data?: string; size?: number; attachmentId?: string };
	parts?: MessagePart[];
	headers?: { name?: string; value?: string }[];
}

export interface GmailMessage {
	id?: string;
	threadId?: string;
	snippet?: string;
	labelIds?: string[];
	internalDate?: string;
	payload?: MessagePart;
}

export interface AttachmentRef {
	filename: string;
	mimeType: string;
	size: number;
	attachmentId: string;
}

export interface ParsedMessage {
	id: string;
	threadId: string;
	from: string;
	to: string;
	cc: string;
	subject: string;
	date: string;
	messageId: string;
	labelIds: string[];
	body: string;
	attachments: AttachmentRef[];
}

function header(part: MessagePart | undefined, name: string): string {
	const match = part?.headers?.find(
		(entry) => entry.name?.toLowerCase() === name.toLowerCase(),
	);
	return match?.value ?? "";
}

function walk(
	part: MessagePart | undefined,
	found: { plain: string[]; html: string[]; attachments: AttachmentRef[] },
): void {
	if (!part) return;

	if (part.body?.attachmentId && part.filename) {
		found.attachments.push({
			filename: part.filename,
			mimeType: part.mimeType ?? "application/octet-stream",
			size: part.body.size ?? 0,
			attachmentId: part.body.attachmentId,
		});
	} else if (part.mimeType === "text/plain" && part.body?.data) {
		found.plain.push(decodeBody(part.body.data));
	} else if (part.mimeType === "text/html" && part.body?.data) {
		found.html.push(decodeBody(part.body.data));
	}

	for (const child of part.parts ?? []) walk(child, found);
}

export function parseMessage(message: GmailMessage): ParsedMessage {
	const found = {
		plain: [] as string[],
		html: [] as string[],
		attachments: [] as AttachmentRef[],
	};
	walk(message.payload, found);

	const body = found.plain.length
		? normalizeText(found.plain.join("\n"))
		: found.html.length
			? htmlToText(found.html.join("\n"))
			: (message.snippet ?? "");

	return {
		id: message.id ?? "",
		threadId: message.threadId ?? "",
		from: header(message.payload, "from"),
		to: header(message.payload, "to"),
		cc: header(message.payload, "cc"),
		subject: header(message.payload, "subject"),
		date: header(message.payload, "date"),
		messageId: header(message.payload, "message-id"),
		labelIds: message.labelIds ?? [],
		body,
		attachments: found.attachments,
	};
}

export function renderMessage(parsed: ParsedMessage): string {
	const lines = [
		`Subject: ${parsed.subject}`,
		`From: ${parsed.from}`,
		`To: ${parsed.to}`,
	];
	if (parsed.cc) lines.push(`Cc: ${parsed.cc}`);
	lines.push(`Date: ${parsed.date}`);
	lines.push(`Gmail ID: ${parsed.id}   Thread ID: ${parsed.threadId}`);
	if (parsed.messageId) lines.push(`Message-ID: ${parsed.messageId}`);
	if (parsed.labelIds.length)
		lines.push(`Labels: ${parsed.labelIds.join(", ")}`);
	if (parsed.attachments.length) {
		lines.push(
			`Attachments: ${parsed.attachments
				.map(
					(entry) =>
						`${entry.filename} (${entry.mimeType}, ${entry.size} bytes, id ${entry.attachmentId})`,
				)
				.join("; ")}`,
		);
	}
	lines.push("", parsed.body);
	return lines.join("\n");
}
