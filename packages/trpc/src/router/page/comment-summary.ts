import { db } from "@superset/db/client";
import {
	pageCommentReads,
	pageComments,
	pageCommentThreads,
	type SelectPageComment,
	users,
} from "@superset/db/schema";
import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { agentLabelFor } from "../page-comment/shape";

export interface PageCommentPreview {
	threadId: string;
	commentId: string;
	body: string;
	createdAt: Date;
	authorKind: SelectPageComment["authorKind"];
	authorName: string;
	authorImage: string | null;
	agentLabel: string | null;
	/** Newer than the viewer's read watermark for this page. */
	unread: boolean;
}

export interface PageCommentSummary {
	count: number;
	preview: PageCommentPreview | null;
}

const EMPTY_SUMMARY: PageCommentSummary = { count: 0, preview: null };

/**
 * Per-page comment rollup for a list of pages: how many comments each page
 * has, and the one comment worth previewing on its card — the newest one not
 * written by the viewer, on an unresolved thread. Unread comments are always
 * newer than the viewer's watermark, so newest-first already prefers them.
 */
export async function pageCommentSummaries({
	pageIds,
	userId,
}: {
	pageIds: string[];
	userId: string;
}): Promise<Map<string, PageCommentSummary>> {
	const summaries = new Map<string, PageCommentSummary>();
	if (pageIds.length === 0) return summaries;

	// A comment counts as the viewer's own only when they wrote it themselves;
	// an agent reply posted through their session is still news to them.
	const notOwnComment = or(
		isNull(pageComments.authorUserId),
		ne(pageComments.authorUserId, userId),
		ne(pageComments.authorKind, "human"),
	);

	const [countRows, previewRows] = await Promise.all([
		db
			.select({ pageId: pageCommentThreads.pageId, total: count() })
			.from(pageComments)
			.innerJoin(
				pageCommentThreads,
				eq(pageCommentThreads.id, pageComments.threadId),
			)
			.where(
				and(
					inArray(pageCommentThreads.pageId, pageIds),
					isNull(pageComments.deletedAt),
				),
			)
			.groupBy(pageCommentThreads.pageId),
		db
			.selectDistinctOn([pageCommentThreads.pageId], {
				pageId: pageCommentThreads.pageId,
				threadId: pageCommentThreads.id,
				commentId: pageComments.id,
				body: pageComments.body,
				createdAt: pageComments.createdAt,
				authorKind: pageComments.authorKind,
				agentSessionId: pageComments.agentSessionId,
				authorName: users.name,
				authorImage: users.image,
				unread: sql<boolean>`${pageComments.createdAt} > coalesce(${pageCommentReads.lastSeenAt}, to_timestamp(0))`,
			})
			.from(pageComments)
			.innerJoin(
				pageCommentThreads,
				eq(pageCommentThreads.id, pageComments.threadId),
			)
			.leftJoin(users, eq(users.id, pageComments.authorUserId))
			.leftJoin(
				pageCommentReads,
				and(
					eq(pageCommentReads.pageId, pageCommentThreads.pageId),
					eq(pageCommentReads.userId, userId),
				),
			)
			.where(
				and(
					inArray(pageCommentThreads.pageId, pageIds),
					isNull(pageComments.deletedAt),
					isNull(pageCommentThreads.resolvedAt),
					notOwnComment,
				),
			)
			.orderBy(pageCommentThreads.pageId, desc(pageComments.createdAt)),
	]);

	for (const row of countRows) {
		summaries.set(row.pageId, { count: row.total, preview: null });
	}
	for (const row of previewRows) {
		const existing = summaries.get(row.pageId) ?? EMPTY_SUMMARY;
		summaries.set(row.pageId, {
			count: existing.count,
			preview: {
				threadId: row.threadId,
				commentId: row.commentId,
				body: row.body,
				createdAt: row.createdAt,
				authorKind: row.authorKind,
				authorName: row.authorName ?? "Unknown",
				authorImage: row.authorImage,
				agentLabel: agentLabelFor(row),
				unread: row.unread,
			},
		});
	}
	return summaries;
}

export async function withCommentSummaries<T extends { id: string }>(
	items: T[],
	userId: string,
): Promise<
	(T & { commentCount: number; commentPreview: PageCommentPreview | null })[]
> {
	const summaries = await pageCommentSummaries({
		pageIds: items.map((item) => item.id),
		userId,
	});
	return items.map((item) => {
		const summary = summaries.get(item.id);
		return {
			...item,
			commentCount: summary?.count ?? 0,
			commentPreview: summary?.preview ?? null,
		};
	});
}
