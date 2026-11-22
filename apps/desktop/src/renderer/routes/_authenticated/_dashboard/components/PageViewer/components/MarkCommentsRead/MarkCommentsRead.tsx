import { useComments } from "@superset/ui/page-comments";
import { useEffect, useMemo, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface MarkCommentsReadProps {
	pageId: string;
}

/**
 * Advances the viewer's read watermark while the comments UI is actually
 * showing — the panel, comment mode, or an open thread — not merely because
 * the page is open with its pins hidden. The watermark moves to the newest
 * comment that was rendered, never past it, so a reply still in flight keeps
 * its dot. The pages list is invalidated so the grid's unread dots clear
 * when the reader goes back.
 */
export function MarkCommentsRead({ pageId }: MarkCommentsReadProps) {
	const { isLoading, threads, panelOpen, enabled, activeThreadId } =
		useComments();
	const utils = cloudTrpc.useUtils();
	const markedAt = useRef(0);
	const inFlight = useRef<number | null>(null);
	const { mutate } = cloudTrpc.pageComment.markRead.useMutation({
		retry: 2,
		onSuccess: () => void utils.page.listPaginated.invalidate(),
	});

	const newestCommentAt = useMemo(() => {
		let newest = 0;
		for (const thread of threads) {
			for (const comment of thread.comments) {
				const at = new Date(comment.createdAt).getTime();
				if (at > newest) newest = at;
			}
		}
		return newest;
	}, [threads]);

	const commentsVisible = panelOpen || enabled || activeThreadId !== null;

	useEffect(() => {
		if (!commentsVisible || isLoading || newestCommentAt === 0) return;
		if (newestCommentAt <= markedAt.current) return;
		if (inFlight.current !== null && newestCommentAt <= inFlight.current)
			return;
		const seenThrough = newestCommentAt;
		inFlight.current = seenThrough;
		mutate(
			{ pageId, seenThrough: new Date(seenThrough) },
			{
				onSuccess: () => {
					if (seenThrough > markedAt.current) markedAt.current = seenThrough;
				},
				onSettled: () => {
					if (inFlight.current === seenThrough) inFlight.current = null;
				},
			},
		);
	}, [commentsVisible, isLoading, mutate, newestCommentAt, pageId]);

	return null;
}
