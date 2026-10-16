import { useInboxPrefetch } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxPrefetch";

/** Follows the selection by itself, so the list does not render again each time the selection moves. */
export function InboxPrefetch({ enabled }: { enabled: boolean }) {
	useInboxPrefetch(enabled);
	return null;
}
