import { randomUUID } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import {
	attachments,
	pages,
	pageVersions,
	type SelectPage,
} from "@superset/db/schema";
import { mintPageSlug } from "@superset/shared/page-slug";
import { pageVersionKey } from "@superset/shared/usercontent";
import { and, desc, eq } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { detachAll, reapOrphanFiles } from "../../lib/files";
import { copyObject, deleteObjects } from "../../lib/r2";
import { pageUrl } from "./page-url";
import { servedVersion } from "./shared-version";
import { writePageManifest } from "./storage";
import { enqueuePageThumbnail } from "./thumbnail";

export async function duplicatePage({
	source,
	title,
	userId,
}: {
	source: SelectPage;
	title?: string;
	userId: string;
}) {
	const copyId = randomUUID();
	const key = pageVersionKey(copyId, 1);
	const copyTitle = title ?? source.title;

	const { copy, versionId } = await dbWs.transaction(async (tx) => {
		// A concurrent delete of the source waits on this lock, so it cannot
		// reap files this copy is about to reference.
		const [held] = await tx
			.select({
				sharedVersion: pages.sharedVersion,
				takenDownAt: pages.takenDownAt,
			})
			.from(pages)
			.where(eq(pages.id, source.id))
			.for("key share");
		if (!held) {
			throw userError({
				code: "NOT_FOUND",
				message: "Page not found",
				i18nKey: "serverError.page.pageNotFound",
			});
		}
		if (held.takenDownAt) {
			throw userError({
				code: "FORBIDDEN",
				message: "This page was taken down and can no longer be changed",
				i18nKey: "serverError.page.thisPageWasTakenDown",
			});
		}

		const [latest] = await tx
			.select({ version: pageVersions.version })
			.from(pageVersions)
			.where(eq(pageVersions.pageId, source.id))
			.orderBy(desc(pageVersions.version))
			.limit(1);
		const version = servedVersion(held.sharedVersion, latest?.version ?? null);
		const [from] =
			version === null
				? []
				: await tx
						.select()
						.from(pageVersions)
						.where(
							and(
								eq(pageVersions.pageId, source.id),
								eq(pageVersions.version, version),
							),
						)
						.limit(1);
		if (!from) {
			throw userError({
				code: "NOT_FOUND",
				message: "Page has no versions",
				i18nKey: "serverError.page.pageHasNoVersions",
			});
		}

		const [page] = await tx
			.insert(pages)
			.values({
				id: copyId,
				slug: mintPageSlug(copyTitle),
				organizationId: source.organizationId,
				createdByUserId: userId,
				title: copyTitle,
				description: source.description,
				visibility: "just_me",
			})
			.returning();
		const [row] = await tx
			.insert(pageVersions)
			.values({
				pageId: copyId,
				version: 1,
				storageKey: key,
				contentType: from.contentType,
				sizeBytes: from.sizeBytes,
				sha256: from.sha256,
				createdByUserId: userId,
			})
			.returning({ id: pageVersions.id });
		if (!page || !row) {
			throw userError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to create page",
				i18nKey: "serverError.page.failedToCreatePage",
			});
		}

		const assets = await tx
			.select({ fileId: attachments.fileId, path: attachments.path })
			.from(attachments)
			.where(
				and(
					eq(attachments.parentKind, "page_version"),
					eq(attachments.parentId, from.id),
				),
			);
		if (assets.length > 0) {
			await tx.insert(attachments).values(
				assets.map((asset) => ({
					fileId: asset.fileId,
					parentKind: "page_version" as const,
					parentId: row.id,
					path: asset.path,
				})),
			);
		}

		await copyObject({
			sourceKey: from.storageKey,
			key,
			contentType: from.contentType,
		});
		return { copy: page, versionId: row.id };
	});

	try {
		await writePageManifest(copy.id);
	} catch (error) {
		// Without a manifest the origin cannot serve the copy, and a retry
		// would make a second page instead of repairing this one.
		await db.delete(pages).where(eq(pages.id, copy.id));
		await reapOrphanFiles(
			await detachAll({ parentKind: "page_version", parentIds: [versionId] }),
		);
		await deleteObjects([key]);
		throw error;
	}
	void enqueuePageThumbnail({ pageId: copy.id, version: 1 });

	return {
		id: copy.id,
		slug: copy.slug,
		url: pageUrl(copy.slug),
		title: copy.title,
		visibility: copy.visibility,
	};
}
