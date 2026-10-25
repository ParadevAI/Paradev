import { db } from "@superset/db/client";
import { files, type SelectFile } from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import type { TRPCRouterRecord } from "@trpc/server";
import { headObject, presignedGetUrl, presignedPutUrl } from "../../lib/r2";
import type { SandboxCaller } from "../../lib/sandbox/api-credential";
import { protectedProcedure, userError } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { resolvableFiles, TRANSFER_ONLY } from "./resolvable";
import {
	createAttachmentUploadSchema,
	resolveAttachmentsSchema,
} from "./schema";

/**
 * Composer attachments: bytes on their way from a client to the machine an
 * agent is running on.
 *
 * The client PUTs straight to R2 and the host GETs straight from R2, so a
 * 200 MB asset bundle never crosses the relay — which buffers whole request
 * bodies in a Worker isolate and is refused outright by Cloudflare's edge
 * above 100 MB. What travels over the relay is a list of file ids.
 *
 * A row stays `pending` while it is only a transfer buffer, which the file
 * sweep reclaims a day later. A file sent to a cloud workspace is kept
 * instead: `anchorAttachments` marks it `ready` on that workspace, and it is
 * reaped with the workspace's box.
 */
export const attachmentRouter = {
	/**
	 * Records the upload and hands back a presigned PUT. The signature covers
	 * the declared type and length, so the bytes that land are the size the
	 * caller claimed — `resolve` is where that is checked, since the PUT
	 * happens without the API seeing it.
	 */
	createUpload: protectedProcedure
		.input(createAttachmentUploadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const [row] = await db
				.insert(files)
				.values({
					organizationId,
					name: input.name,
					contentType: input.contentType,
					sizeBytes: input.sizeBytes,
					// Identity by content is what lets a page reuse an unchanged
					// asset across versions. An attachment is written once and
					// read once, so hashing it would only cost the client a full
					// read of a file it is about to stream from disk.
					sha256: TRANSFER_ONLY,
					createdByUserId: ctx.session.user.id,
				})
				.returning({ id: files.id });
			if (!row) {
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to record the upload",
					i18nKey: "serverError.page.failedToRecordTheUpload",
				});
			}

			const upload = await presignedPutUrl({
				key: fileOriginalKey(row.id),
				contentType: input.contentType,
				contentLength: input.sizeBytes,
				// The default 15 minutes is sized for a browser on a desk. A
				// phone sending the largest attachment we allow would need
				// ~15 Mbps sustained to beat it, and expiry lands as a 403
				// after the whole upload — so the TTL, not the connection, is
				// what would decide. An hour covers 200 MB at ~500 Kbps, and
				// matches what `presignedGetUrl` already hands the host.
				expiresInSeconds: 60 * 60,
			});
			return { fileId: row.id, upload };
		}),

	/**
	 * Presigned GETs for a host about to materialize these into a worktree,
	 * with the metadata it needs to name the files.
	 *
	 * Scoped by `resolvableFiles`: `files.id` is the only thing the caller
	 * presents, and knowing one is not authority to read it.
	 *
	 * A mutation despite reading nothing but rows: the URLs it mints are
	 * short-lived credentials, and a query's response is cacheable.
	 */
	resolve: protectedProcedure
		.input(resolveAttachmentsSchema)
		.mutation(async ({ ctx, input }) => {
			const byId = await loadResolvable(ctx, input.fileIds);

			// In the order asked for: the caller names attachments positionally
			// and a reordered answer would rename them.
			return await Promise.all(
				input.fileIds.map(async (fileId) => {
					const file = byId.get(fileId);
					if (!file) {
						throw userError({
							code: "NOT_FOUND",
							message: "Attachment not found",
							i18nKey: "serverError.attachment.notFound",
						});
					}
					const resolved = await signUploaded(file);
					if (!resolved) {
						throw userError({
							code: "BAD_REQUEST",
							message: "Attachment was not uploaded — send the bytes first",
							i18nKey: "serverError.attachment.notUploaded",
						});
					}
					return resolved;
				}),
			);
		}),

	/**
	 * `resolve` for a reader that shows what it can: a transcript with one
	 * file gone still renders the rest. Every id gets an answer, in the order
	 * asked for, and one the caller may not see is reported the same as one
	 * that does not exist.
	 */
	resolveEach: protectedProcedure
		.input(resolveAttachmentsSchema)
		.mutation(async ({ ctx, input }) => {
			const byId = await loadResolvable(ctx, input.fileIds);
			return await Promise.all(
				input.fileIds.map(async (fileId) => {
					const file = byId.get(fileId);
					const resolved = file ? await signUploaded(file) : null;
					return resolved ?? { fileId, missing: true as const };
				}),
			);
		}),
} satisfies TRPCRouterRecord;

async function loadResolvable(
	ctx: Parameters<typeof requireActiveOrgMembership>[0] & {
		sandboxCaller: SandboxCaller | null;
	},
	fileIds: string[],
) {
	const rows = await resolvableFiles({
		organizationId: await requireActiveOrgMembership(ctx),
		userId: ctx.session.user.id,
		boxWorkspaceId: ctx.sandboxCaller?.workspaceId ?? null,
		fileIds,
	});
	return new Map(rows.map((row) => [row.id, row]));
}

/**
 * A presigned PUT lands without the API seeing it, so this is where an
 * upload is held to what it declared. A short read that never finished is
 * the case worth catching — it would otherwise reach the agent as a
 * truncated file. Null when the bytes are not there.
 */
async function signUploaded(file: SelectFile) {
	const key = fileOriginalKey(file.id);
	const head = await headObject(key);
	if (!head || head.sizeBytes !== file.sizeBytes) return null;
	return {
		fileId: file.id,
		name: file.name,
		contentType: file.contentType,
		sizeBytes: file.sizeBytes,
		url: await presignedGetUrl(key),
	};
}
