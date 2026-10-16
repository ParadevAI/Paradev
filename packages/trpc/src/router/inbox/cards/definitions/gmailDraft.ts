import { db } from "@superset/db/client";
import { files } from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Attachment } from "../../../../lib/gmail/mime";
import { getObject } from "../../../../lib/r2";
import { CardUnavailable } from "../types";
import { blockedArchive, blockedByName, isArchive } from "./attachmentPolicy";
import { sendInputSchema } from "./gmailReply";

/** Gmail's own ceiling for one email; past it Gmail moves files to Drive, which Superset can't reach. */
export const EMAIL_BYTES_MAX = 25 * 1024 * 1024;

export const saveDraftSchema = sendInputSchema.extend({
	/** The draft's files to keep, by MIME part; all of them when absent. */
	keep: z.array(z.string().max(64)).max(50).optional(),
	/** Files the reader just added, uploaded through `attachment.createUpload`. */
	uploads: z.array(z.string().uuid()).max(20).default([]),
});
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

/** One of the reader's addresses Gmail lets them send as, with its signature. */
export interface SendAs {
	email: string;
	name: string | null;
	isDefault: boolean;
	/** The signature's HTML, as set in Gmail; empty when there is none. */
	signature: string;
}

/** Why Gmail refuses a file, in Gmail's words, or null when it goes out. */
export function blockedReason(file: Attachment): string | null {
	const blocked =
		blockedByName(file.filename) ||
		(isArchive(file.filename) &&
			blockedArchive(
				new Uint8Array(Buffer.from(file.content, "base64")),
				file.filename,
			));
	return blocked ? `${file.filename} was blocked for security reasons` : null;
}

/** The reader's fresh uploads as attachments, refusing anyone else's files and what Gmail blocks. */
export async function uploadedAttachments(args: {
	organizationId: string;
	userId: string;
	fileIds: string[];
}): Promise<Attachment[]> {
	if (args.fileIds.length === 0) return [];
	const rows = await db
		.select()
		.from(files)
		.where(
			and(
				inArray(files.id, args.fileIds),
				eq(files.organizationId, args.organizationId),
				eq(files.createdByUserId, args.userId),
			),
		);
	const byId = new Map(rows.map((row) => [row.id, row]));
	const attachments: Attachment[] = [];
	for (const id of args.fileIds) {
		const row = byId.get(id);
		const object = row ? await getObject(fileOriginalKey(id)) : null;
		if (!row || !object) {
			throw new CardUnavailable(
				"error",
				"An attachment did not finish uploading",
			);
		}
		const bytes = Buffer.from(await object.arrayBuffer());
		const attachment = {
			filename: row.name,
			mimeType: row.contentType,
			content: bytes.toString("base64"),
		};
		const reason = blockedReason(attachment);
		if (reason) throw new CardUnavailable("error", reason);
		attachments.push(attachment);
	}
	return attachments;
}

export function attachmentBytes(attachments: Attachment[]): number {
	return attachments.reduce(
		(total, file) => total + Math.floor((file.content.length * 3) / 4),
		0,
	);
}
