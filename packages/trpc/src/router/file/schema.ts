import { z } from "zod";

export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

export const ATTACHMENT_PARENT_KINDS = [
	"page_version",
	"issue",
	"doc",
	"chat_session",
	"comment",
] as const;

export const createUploadSchema = z.object({
	name: z.string().min(1).max(255),
	contentType: z.string().min(1).max(255),
	sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const fileIdSchema = z.object({ id: z.string().uuid() });

export const listAttachmentsSchema = z.object({
	parentKind: z.enum(ATTACHMENT_PARENT_KINDS),
	parentId: z.string().uuid(),
});
