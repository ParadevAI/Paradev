import { useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useInboxSelectionStore } from "renderer/routes/_authenticated/_dashboard/stores/inboxSelectionStore";
import { finishedWorkspaceId } from "renderer/routes/_authenticated/_dashboard/utils/inboxSelection";
import { cardsToPreload } from "./utils/cardsToPreload";

/** A resolved document read this recently is shown as it is; an older one is shown and refreshed behind. */
export const INBOX_DOCUMENT_FRESH_MS = 30_000;
const REST_MS = 150;

/**
 * Loads the cards ahead of the selected one once the selection rests, and the
 * first few when the inbox opens, so the next card is already here. One at a
 * time and nearest first, so they never crowd the selected card's own load or
 * an integration's rate limit. A held key passes over cards without loading
 * each.
 */
export function useInboxPrefetch(enabled: boolean) {
	const utils = cloudTrpc.useUtils();
	const selectedId = useInboxSelectionStore((state) => state.selectedId);
	const listed = useInboxSelectionStore((state) => state.order.length > 0);
	const lastAt = useRef(-1);

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the selection moves or the list first arrives
	useEffect(() => {
		if (!enabled || !listed) return;
		let stopped = false;
		const timer = setTimeout(async () => {
			const { order, cards } = useInboxSelectionStore.getState();
			const at = selectedId ? order.indexOf(selectedId) : -1;
			const ids = cardsToPreload(order, at, at < lastAt.current ? -1 : 1);
			lastAt.current = at;
			for (const id of ids) {
				if (stopped) return;
				if (finishedWorkspaceId(id) || !cards[id]?.hasDocument) continue;
				await utils.inbox.document
					.prefetch({ id }, { staleTime: INBOX_DOCUMENT_FRESH_MS })
					.catch(() => {});
			}
		}, REST_MS);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, [enabled, listed, selectedId]);
}
