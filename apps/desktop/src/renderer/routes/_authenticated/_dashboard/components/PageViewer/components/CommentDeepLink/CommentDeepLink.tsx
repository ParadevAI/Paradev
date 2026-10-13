import { useComments } from "@superset/ui/page-comments";
import { useEffect, useRef } from "react";

interface CommentDeepLinkProps {
	threadId: string | null;
	openPanel: boolean;
}

/**
 * Applies a comment deep link once threads have loaded: opens the comments
 * panel and, when the link names a thread that still exists, activates it so
 * the panel scrolls to it. Each distinct link is applied once — the viewer
 * stays mounted across a search-only navigation to the same page, so a new
 * thread in the URL must apply again while later navigation inside the
 * viewer stays the reader's own.
 */
export function CommentDeepLink({ threadId, openPanel }: CommentDeepLinkProps) {
	const { isLoading, threads, setPanelOpen, setActiveThreadId } = useComments();
	const applied = useRef<string | null>(null);
	const link = `${openPanel ? "panel" : ""}|${threadId ?? ""}`;

	useEffect(() => {
		if (applied.current === link) return;
		if (!threadId && !openPanel) {
			applied.current = link;
			return;
		}
		if (isLoading) return;
		applied.current = link;
		setPanelOpen(true);
		if (threadId && threads.some((thread) => thread.id === threadId)) {
			setActiveThreadId(threadId);
		}
	}, [
		isLoading,
		link,
		openPanel,
		setActiveThreadId,
		setPanelOpen,
		threadId,
		threads,
	]);

	return null;
}
