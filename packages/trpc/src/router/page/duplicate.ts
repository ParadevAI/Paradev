import { randomUUID } from "node:crypto";
import { dbWs } from "@superset/db/client";
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
import { copyObject } from "../../lib/r2";
import { pageUrl } from "./page-url";
import { servedVersion } from "./shared-version";
import { writePageManifest } from "./storage";
import { enqueuePageThumbnail } from "./thumbnail";

/**
 * A private page of `userId`'s holding the version `source` serves, as its
 * version 1. Assets are shared with the source by reference; comments,
 * shares, history and the workspace link stay behind.
 */
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

	const copy = await dbWs.transaction(async (tx) => {
		// Held until commit: a concurrent delete of the source waits, so it
		// cannot reap files this copy is about to reference.
		const [held] = await tx
			.select({ id: pages.id })
			.from(pages)
			.where(eq(pages.id, source.id))
			.for("share");
		if (!held) {
			throw userError({
				code: "NOT_FOUND",
				message: "Page not found",
				i18nKey: "serverError.page.pageNotFound",
			});
		}

		const [latest] = await tx
			.select({ version: pageVersions.version })
			.from(pageVersions)
			.where(eq(pageVersions.pageId, source.id))
			.orderBy(desc(pageVersions.version))
			.limit(1);
		const version = servedVersion(
			source.sharedVersion,
			latest?.version ?? null,
		);
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
		return page;
	});

	await writePageManifest(copy.id);
	void enqueuePageThumbnail({ pageId: copy.id, version: 1 });

	return {
		id: copy.id,
		slug: copy.slug,
		url: pageUrl(copy.slug),
		title: copy.title,
		visibility: copy.visibility,
	};
}
