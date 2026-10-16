import { useEffect, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { INBOX_DOCUMENT_FRESH_MS } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxPrefetch";
import { useInboxSelectionStore } from "renderer/routes/_authenticated/_dashboard/stores/inboxSelectionStore";

const CARD_LOAD_RETRIES = 3;
const CARD_LOAD_RETRY_MS = 500;
const CARD_REST_MS = 120;

/**
 * A card and its document for the detail pane. The card shows at once from
 * what the list holds, and a document read before shows at once from the
 * cache; both are then refreshed. A held key passes over cards, so only the
 * card the selection rests on is loaded.
 */
export function useInboxCard(cardId: string) {
	const listed = useInboxSelectionStore((state) => state.cards[cardId]);
	const [rested, setRested] = useState(cardId);
	useEffect(() => {
		const timer = setTimeout(() => setRested(cardId), CARD_REST_MS);
		return () => clearTimeout(timer);
	}, [cardId]);
	const loads = rested === cardId;
	const card = cloudTrpc.inbox.get.useQuery(
		{ id: cardId },
		{
			enabled: loads,
			placeholderData: listed,
			retry: (failures) => failures < CARD_LOAD_RETRIES,
			retryDelay: (attempt) => CARD_LOAD_RETRY_MS * 2 ** attempt,
		},
	);
	const document = cloudTrpc.inbox.document.useQuery(
		{ id: cardId },
		{
			enabled: loads && card.data?.hasDocument === true,
			staleTime: INBOX_DOCUMENT_FRESH_MS,
			trpc: { abortOnUnmount: true },
		},
	);
	return { card, document };
}
