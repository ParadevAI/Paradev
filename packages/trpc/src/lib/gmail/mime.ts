import { randomUUID } from "node:crypto";

export interface Attachment {
	filename: string;
	content: string;
	mimeType?: string;
}

export interface EmailFields {
	from?: string;
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	body: string;
	htmlBody?: string;
	attachments: Attachment[];
	inReplyTo?: string;
	references?: string;
	threadId?: string;
}

const ASCII = /^[\x20-\x7e]*$/;

export function headerSafe(value: string, field: string): string {
	if (/[\r\n]/.test(value)) {
		throw new Error(`${field} may not contain a carriage return or line feed`);
	}
	return value;
}

function quoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function base64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64Utf8(value: string): string {
	return base64(new TextEncoder().encode(value));
}

function base64Url(value: string): string {
	return base64Utf8(value)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function encodeHeader(value: string): string {
	return ASCII.test(value) ? value : `=?UTF-8?B?${base64Utf8(value)}?=`;
}

function encodeAddress(value: string): string {
	const match = value.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
	if (!match) return value.trim();
	return `${encodeHeader(match[1] as string)} <${(match[2] as string).trim()}>`;
}

function wrap(value: string): string {
	return (value.match(/.{1,76}/g) ?? []).join("\r\n");
}

function boundary(): string {
	return `=_superset_${randomUUID().replace(/-/g, "")}`;
}

function part(contentType: string, content: string, extra: string[] = []) {
	return [
		`Content-Type: ${contentType}`,
		"Content-Transfer-Encoding: base64",
		...extra,
		"",
		wrap(base64Utf8(content)),
	].join("\r\n");
}

function attachmentPart(attachment: Attachment): string {
	const name = quoted(encodeHeader(attachment.filename));
	const mimeType = headerSafe(
		attachment.mimeType ?? "application/octet-stream",
		"attachment mimeType",
	);
	return [
		`Content-Type: ${mimeType}; name="${name}"`,
		"Content-Transfer-Encoding: base64",
		`Content-Disposition: attachment; filename="${name}"`,
		"",
		wrap(attachment.content.replace(/\s+/g, "")),
	].join("\r\n");
}

function multipart(subtype: string, parts: string[]): string {
	const mark = boundary();
	const body = parts
		.map((entry) => `--${mark}\r\n${entry}`)
		.concat(`--${mark}--`)
		.join("\r\n");
	return `${subtype}; boundary="${mark}"\r\n\r\n${body}`;
}

export function buildMime(fields: EmailFields): string {
	if (!fields.to.length && !fields.cc.length && !fields.bcc.length) {
		throw new Error("at least one recipient is required in to, cc, or bcc");
	}

	const headers = ["MIME-Version: 1.0"];
	if (fields.from)
		headers.push(`From: ${encodeAddress(headerSafe(fields.from, "from"))}`);
	if (fields.to.length)
		headers.push(`To: ${fields.to.map(encodeAddress).join(", ")}`);
	if (fields.cc.length)
		headers.push(`Cc: ${fields.cc.map(encodeAddress).join(", ")}`);
	if (fields.bcc.length)
		headers.push(`Bcc: ${fields.bcc.map(encodeAddress).join(", ")}`);
	headers.push(`Subject: ${encodeHeader(fields.subject)}`);
	if (fields.inReplyTo) {
		headers.push(`In-Reply-To: ${headerSafe(fields.inReplyTo, "inReplyTo")}`);
		headers.push(
			`References: ${headerSafe(fields.references ?? fields.inReplyTo, "references")}`,
		);
	}

	const plain = part('text/plain; charset="UTF-8"', fields.body);
	const alternative = fields.htmlBody
		? multipart("multipart/alternative", [
				plain,
				part('text/html; charset="UTF-8"', fields.htmlBody),
			])
		: null;

	if (fields.attachments.length) {
		const lead = alternative ? `Content-Type: ${alternative}` : plain;
		return `${headers.join("\r\n")}\r\nContent-Type: ${multipart(
			"multipart/mixed",
			[lead, ...fields.attachments.map(attachmentPart)],
		)}`;
	}

	if (alternative) {
		return `${headers.join("\r\n")}\r\nContent-Type: ${alternative}`;
	}

	return `${headers.join("\r\n")}\r\n${plain}`;
}

export function encodeRaw(fields: EmailFields): string {
	return base64Url(buildMime(fields));
}

export function decodeBody(data?: string): string {
	if (!data) return "";
	const padded = data.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new TextDecoder().decode(bytes);
}

export function normalizeText(value: string): string {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function htmlToText(html: string): string {
	return normalizeText(
		html
			.replace(/<style[\s\S]*?<\/style>/gi, "")
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<li[^>]*>/gi, "\n- ")
			.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'"),
	);
}
