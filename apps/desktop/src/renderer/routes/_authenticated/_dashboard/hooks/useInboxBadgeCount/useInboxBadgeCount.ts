import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useFinishedWorkspaces } from "renderer/routes/_authenticated/_dashboard/hooks/useFinishedWorkspaces";
import { useInboxEnabled } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxEnabled";
import { inboxBadgeCount } from "renderer/routes/_authenticated/_dashboard/utils/inboxBadgeCount";
import { useInboxPanelStore } from "renderer/stores/inbox-panel-state";

/** The number on the inbox button: what is unread among the kinds of card the reader has not hidden. */
export function useInboxBadgeCount(): number {
	const isEnabled = useInboxEnabled();
	const showUpdates = useInboxPanelStore((s) => s.showUpdates);
	const showFinished = useInboxPanelStore((s) => s.showFinished);
	const finished = useFinishedWorkspaces();
	const count = cloudTrpc.inbox.count.useQuery(undefined, {
		enabled: isEnabled,
		staleTime: 30_000,
	});
	return inboxBadgeCount({
		unreadAsks: count.data?.unread ?? 0,
		unreadUpdates: count.data?.unreadUpdates ?? 0,
		unreadFinished: count.data?.unreadFinished ?? [],
		finishedHere: finished.map((entry) => entry.workspaceId),
		showUpdates,
		showFinished,
	});
}
