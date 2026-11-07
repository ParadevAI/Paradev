import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type ChannelMessage,
	removeMessage,
	upsertIntoPages,
	upsertMessage,
} from "../../utils/channelMessageCache";

type CloudUtils = ReturnType<typeof cloudTrpc.useUtils>;

export function applyChannelMessage(
	utils: CloudUtils,
	message: ChannelMessage,
): void {
	if (message.threadRootId) {
		utils.channelMessage.thread.setData(
			{ messageId: message.threadRootId },
			(thread) =>
				thread && {
					...thread,
					replies: upsertMessage(thread.replies, message),
				},
		);
		return;
	}
	utils.channelMessage.list.setInfiniteData(
		{ channelId: message.channelId },
		(data) => data && { ...data, pages: upsertIntoPages(data.pages, message) },
	);
	utils.channelMessage.thread.setData(
		{ messageId: message.id },
		(thread) => thread && { ...thread, root: message },
	);
}

/** Drops a pending message whose send failed. */
export function discardChannelMessage(
	utils: CloudUtils,
	message: ChannelMessage,
): void {
	if (message.threadRootId) {
		utils.channelMessage.thread.setData(
			{ messageId: message.threadRootId },
			(thread) =>
				thread && {
					...thread,
					replies: removeMessage(thread.replies, message.id),
				},
		);
		return;
	}
	utils.channelMessage.list.setInfiniteData(
		{ channelId: message.channelId },
		(data) =>
			data && {
				...data,
				pages: data.pages.map((page) => ({
					...page,
					messages: removeMessage(page.messages, message.id),
				})),
			},
	);
}

export function useApplyChannelMessage() {
	const utils = cloudTrpc.useUtils();
	return {
		apply: useCallback(
			(message: ChannelMessage) => applyChannelMessage(utils, message),
			[utils],
		),
		discard: useCallback(
			(message: ChannelMessage) => discardChannelMessage(utils, message),
			[utils],
		),
	};
}
