import type { gmail_v1 } from "@googleapis/gmail";
import { z } from "zod";
import { env } from "../../../../env";
import { objectExists, presignedGetUrl, putObject } from "../../../../lib/r2";
import { blockedArchive, blockedByName, isArchive } from "./attachmentPolicy";
import { type FileTickets, fileTickets } from "./fileTickets";
import { gmailFor } from "./gmailClient";

const TICKET_TTL_S = 6 * 60 * 60;
const GMAIL_ID = /^[a-f0-9]{8,32}$/i;
const PART_ID = /^[0-9]+(\.[0-9]+)*$/;

const ticketSchema = z.object({
	o: z.string().uuid(),
	u: z.string().min(1),
	m: z.string().regex(GMAIL_ID),
	p: z.string().regex(PART_ID),
});
type Ticket = z.infer<typeof ticketSchema>;

export function gmailFileTickets(
	secret: string,
	now: () => number = Date.now,
): FileTickets<Ticket> {
	return fileTickets(
		{
			secret,
			purpose: "inbox.gmail-file",
			schema: ticketSchema,
			ttlSeconds: TICKET_TTL_S,
		},
		now,
	);
}

const tickets = () => gmailFileTickets(env.USERCONTENT_TOKEN_SECRET);

/** A link to one part of the reader's message, fetched with their own Google token. */
export function gmailFileUrl(
	organizationId: string,
	userId: string,
	messageId: string,
	partId: string,
): string {
	const token = tickets().sign({
		o: organizationId,
		u: userId,
		m: messageId,
		p: partId,
	});
	return `${env.NEXT_PUBLIC_API_URL}/api/inbox/gmail-files/${token}`;
}

export function findPart(
	part: gmail_v1.Schema$MessagePart | undefined,
	partId: string,
): gmail_v1.Schema$MessagePart | null {
	if (!part) return null;
	if (part.partId === partId) return part;
	for (const child of part.parts ?? []) {
		const found = findPart(child, partId);
		if (found) return found;
	}
	return null;
}

async function partBytes(
	client: gmail_v1.Gmail,
	messageId: string,
	part: gmail_v1.Schema$MessagePart,
): Promise<Buffer | null> {
	let data = part.body?.data ?? null;
	if (!data && part.body?.attachmentId) {
		data = await client.users.messages.attachments
			.get({ userId: "me", messageId, id: part.body.attachmentId })
			.then((r) => r.data.data ?? null)
			.catch(() => null);
	}
	return data ? Buffer.from(data, "base64url") : null;
}

/** Gmail caps a message at 25 MB, so no archive is larger than this. */
const ARCHIVE_SCAN_MAX_BYTES = 25 * 1024 * 1024;
const VERDICTS_MAX = 2000;
const verdicts = new Map<string, boolean>();

function remember(key: string, blocked: boolean): boolean {
	if (verdicts.size >= VERDICTS_MAX) {
		const oldest = verdicts.keys().next().value;
		if (oldest) verdicts.delete(oldest);
	}
	verdicts.set(key, blocked);
	return blocked;
}

/** Whether one part is on Gmail's blocked-file list, opening archives to look; a part never changes, so the answer is kept. */
export async function partBlocked(
	client: gmail_v1.Gmail,
	messageId: string,
	part: gmail_v1.Schema$MessagePart,
	bytes?: Buffer,
): Promise<boolean> {
	const filename = part.filename || "";
	if (blockedByName(filename)) return true;
	if (!isArchive(filename)) return false;
	const key = `${messageId}:${part.partId}`;
	const known = verdicts.get(key);
	if (known !== undefined) return known;
	if ((part.body?.size ?? 0) > ARCHIVE_SCAN_MAX_BYTES) return true;
	const data = bytes ?? (await partBytes(client, messageId, part));
	if (!data) return true;
	return remember(key, blockedArchive(new Uint8Array(data), filename));
}

const BLOCKED = () => new Response("Gmail blocks this file", { status: 403 });

const SAFE_INLINE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;
/** Vercel caps a function's response body at 4.5 MB; anything near it is served from storage instead. */
export const DIRECT_MAX_BYTES = 4 * 1024 * 1024;
const STORED_URL_TTL_S = 15 * 60;

export interface FileStorage {
	exists: (key: string) => Promise<boolean>;
	put: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
	url: (
		key: string,
		contentType: string,
		disposition: string,
	) => Promise<string>;
}

const r2Storage: FileStorage = {
	exists: (key) => objectExists(key),
	put: (key, body, contentType) =>
		putObject({ key, body, contentType, bucket: "private" }),
	url: (key, contentType, disposition) =>
		presignedGetUrl(key, STORED_URL_TTL_S, undefined, {
			contentType,
			contentDisposition: disposition,
		}),
};

/**
 * The file behind a ticket. Images show inline; anything else downloads under
 * its own name. A file too large for a function response is copied to private
 * storage once and the reader is sent to a short-lived signed link to it.
 */
export async function serveGmailFile(
	token: string,
	read: FileTickets<Ticket>["read"] = (t) => tickets().read(t),
	account: typeof gmailFor = gmailFor,
	storage: FileStorage = r2Storage,
): Promise<Response> {
	const ticket = read(token);
	if (!ticket) return new Response("Not found", { status: 404 });
	const { client } = await account(ticket.o, ticket.u).catch(() => ({
		client: null,
	}));
	if (!client) return new Response("Not found", { status: 404 });
	const message = await client.users.messages
		.get({ userId: "me", id: ticket.m, format: "full" })
		.then((r) => r.data)
		.catch(() => null);
	const part = findPart(message?.payload ?? undefined, ticket.p);
	if (!part) return new Response("Not found", { status: 404 });
	const type = part.mimeType || "application/octet-stream";
	const inline = SAFE_INLINE.test(type);
	const served = inline ? type : "application/octet-stream";
	const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(part.filename || "attachment")}`;
	const key = `inbox-files/gmail/${ticket.o}/${ticket.u}/${ticket.m}/${ticket.p}`;
	const large = (part.body?.size ?? 0) > DIRECT_MAX_BYTES;
	const name = part.filename || "";
	if (blockedByName(name)) return BLOCKED();
	if (
		large &&
		!isArchive(name) &&
		(await storage.exists(key).catch(() => false))
	) {
		return Response.redirect(await storage.url(key, served, disposition), 302);
	}
	const bytes = await partBytes(client, ticket.m, part);
	if (!bytes) return new Response("Not found", { status: 404 });
	if (await partBlocked(client, ticket.m, part, bytes)) return BLOCKED();
	if (large || bytes.byteLength > DIRECT_MAX_BYTES) {
		if (!(await storage.exists(key).catch(() => false)))
			await storage.put(key, bytes, served);
		return Response.redirect(await storage.url(key, served, disposition), 302);
	}
	return new Response(new Uint8Array(bytes), {
		headers: {
			"content-type": served,
			"content-disposition": disposition,
			"cache-control": `private, max-age=${TICKET_TTL_S}`,
			"x-content-type-options": "nosniff",
			"access-control-allow-origin": "*",
		},
	});
}
