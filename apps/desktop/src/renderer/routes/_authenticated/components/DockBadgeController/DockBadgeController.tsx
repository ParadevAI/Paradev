import { useEffect } from "react";
import { useV2AttentionWorkspaceCount } from "renderer/hooks/host-service/useV2NotificationStatus";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useChannelBadge } from "./hooks/useChannelBadge";

/**
 * Mirrors the unread + attention-needed workspace count and channel
 * mentions onto the OS dock/taskbar badge, with a dot for other channel
 * unreads. Cleared on unmount (e.g. sign-out) so a stale count never
 * lingers on the app icon.
 */
export function DockBadgeController() {
	const workspaces = useV2AttentionWorkspaceCount();
	const channels = useChannelBadge();
	const count = workspaces + channels.mentions;

	useEffect(() => {
		void electronTrpcClient.notifications.setDockBadge.mutate({
			count,
			dot: channels.hasUnread,
		});
	}, [count, channels.hasUnread]);

	useEffect(() => {
		return () => {
			void electronTrpcClient.notifications.setDockBadge.mutate({ count: 0 });
		};
	}, []);

	return null;
}
