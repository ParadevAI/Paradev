import { db } from "@superset/db/client";
import { attachments, cloudWorkspaces, files } from "@superset/db/schema";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { visibleTo } from "../cloud-workspace/access";

/**
 * What marks a `files` row as a composer attachment. Every other kind of file is
 * identified by its content — page assets deduplicate on the digest — and no
 * real file hashes to the empty string, so this both keeps an attachment out
 * of any reuse lookup and keeps `resolve` off files it has no business
 * handing a URL for.
 */
export const TRANSFER_ONLY = "";

/**
 * The attachments among `fileIds` a caller may read.
 *
 * A box gets only the files anchored to its own workspace. Anyone else gets
 * an upload still in flight, and a kept file only through a cloud workspace
 * they can see. In flight stays org-wide because a host resolves with its
 * owner's credential, and the sender may be a teammate who shares that host.
 */
export function resolvableFiles({
	organizationId,
	userId,
	boxWorkspaceId,
	fileIds,
}: {
	organizationId: string;
	userId: string;
	boxWorkspaceId: string | null;
	fileIds: string[];
}) {
	return db
		.select()
		.from(files)
		.where(
			and(
				inArray(files.id, fileIds),
				eq(files.organizationId, organizationId),
				eq(files.sha256, TRANSFER_ONLY),
				boxWorkspaceId
					? inArray(
							files.id,
							anchoredTo(eq(cloudWorkspaces.id, boxWorkspaceId)),
						)
					: or(
							eq(files.status, "pending"),
							inArray(
								files.id,
								anchoredTo(
									and(
										eq(cloudWorkspaces.organizationId, organizationId),
										visibleTo(userId),
									),
								),
							),
						),
			),
		);
}

function anchoredTo(workspaces: SQL | undefined) {
	return db
		.select({ id: attachments.fileId })
		.from(attachments)
		.innerJoin(cloudWorkspaces, eq(cloudWorkspaces.id, attachments.parentId))
		.where(and(eq(attachments.parentKind, "cloud_workspace"), workspaces));
}
