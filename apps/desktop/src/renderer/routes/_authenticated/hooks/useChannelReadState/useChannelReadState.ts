import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

type CloudUtils = ReturnType<typeof cloudTrpc.useUtils>;

export interface ChannelReadState {
	lastReadSeq: number;
	hasUnread: boolean;
	mentionCount: number;
}

export interface ThreadReadState {
	lastReadSeq: number;
	following: boolean;
}

export function applyChannelRead(
	utils: CloudUtils,
	organizationId: string | null,
	channelId: string,
	state: ChannelReadState,
) {
	if (organizationId) {
		utils.channel.list.setData({ organizationId }, (rows) =>
			rows?.map((row) => (row.id === channelId ? { ...row, ...state } : row)),
		);
	}
	utils.channel.get.setData({ channelId }, (channel) =>
		channel?.membership
			? {
					...channel,
					membership: {
						...channel.membership,
						lastReadSeq: state.lastReadSeq,
					},
				}
			: channel,
	);
}

export function applyThreadRead(
	utils: CloudUtils,
	rootId: string,
	follow: ThreadReadState,
) {
	utils.channelMessage.thread.setData({ messageId: rootId }, (thread) =>
		thread ? { ...thread, follow } : thread,
	);
	void utils.channelThread.list.invalidate();
}

/** Read-state cache writers bound to the active organization. */
export function useChannelReadState() {
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	return useMemo(
		() => ({
			applyChannelRead: (channelId: string, state: ChannelReadState) =>
				applyChannelRead(utils, organizationId, channelId, state),
			applyThreadRead: (rootId: string, follow: ThreadReadState) =>
				applyThreadRead(utils, rootId, follow),
		}),
		[utils, organizationId],
	);
}
