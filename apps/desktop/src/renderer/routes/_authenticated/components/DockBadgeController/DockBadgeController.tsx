import { useEffect } from "react";
import { useV2AttentionWorkspaceCount } from "renderer/hooks/host-service/useV2NotificationStatus";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useUnreadChatCount } from "renderer/routes/_authenticated/_dashboard/chats/hooks/useUnreadChatCount";

/**
 * Mirrors the unread + attention-needed workspace count, plus unread chats, onto the OS
 * dock/taskbar badge. Cleared on unmount (e.g. sign-out) so a stale count
 * never lingers on the app icon.
 */
export function DockBadgeController() {
	const count = useV2AttentionWorkspaceCount() + useUnreadChatCount();

	useEffect(() => {
		void electronTrpcClient.notifications.setDockBadge.mutate({ count });
	}, [count]);

	useEffect(() => {
		return () => {
			void electronTrpcClient.notifications.setDockBadge.mutate({ count: 0 });
		};
	}, []);

	return null;
}
