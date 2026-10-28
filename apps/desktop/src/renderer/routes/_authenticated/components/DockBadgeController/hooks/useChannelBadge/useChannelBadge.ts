import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * Slack's dock badge: mentions as a number, a dot for other unreads in
 * channels that are not muted.
 */
export function useChannelBadge(): { mentions: number; hasUnread: boolean } {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const organizationId = useActiveOrganizationId();
	const options = { enabled: enabled && organizationId !== null };
	const input = { organizationId: organizationId ?? "" };
	const { data: channels = [] } = cloudTrpc.channel.list.useQuery(
		input,
		options,
	);
	const { data: threads = [] } = cloudTrpc.channelThread.list.useQuery(
		input,
		options,
	);
	if (!options.enabled) return { mentions: 0, hasUnread: false };
	const mutedIds = new Set(
		channels.filter((channel) => channel.muted).map((channel) => channel.id),
	);
	const mentions =
		channels.reduce((sum, channel) => sum + channel.mentionCount, 0) +
		threads.reduce((sum, thread) => sum + thread.mentionCount, 0);
	const hasUnread =
		channels.some((channel) => channel.hasUnread && !channel.muted) ||
		threads.some(
			(thread) => thread.unreadCount > 0 && !mutedIds.has(thread.channelId),
		);
	return { mentions, hasUnread };
}
