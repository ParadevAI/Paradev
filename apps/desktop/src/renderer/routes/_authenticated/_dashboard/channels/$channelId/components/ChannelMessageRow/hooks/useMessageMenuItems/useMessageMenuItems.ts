import { useLingui } from "@lingui/react/macro";
import type { IconType } from "react-icons";
import {
	LuBell,
	LuBellOff,
	LuCopy,
	LuLink,
	LuMail,
	LuPencil,
	LuTrash2,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { PROTOCOL_SCHEME } from "shared/constants";

export interface MessageMenuItem {
	id:
		| "copy-link"
		| "copy-message"
		| "mark-unread"
		| "follow"
		| "edit"
		| "delete";
	label: string;
	icon: IconType;
	destructive?: boolean;
	run: () => void;
}

/**
 * One list for both More actions and right-click: copying, then read and
 * follow state, then changing the message.
 */
export function useMessageMenuItems({
	message,
	onMarkUnread,
	follow,
	onEdit,
	onDelete,
}: {
	message: ChannelMessage;
	onMarkUnread?: () => void;
	follow?: { following: boolean; onToggle: () => void };
	onEdit?: () => void;
	onDelete?: () => void;
}): MessageMenuItem[][] {
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();
	const thread = message.threadRootId ?? message.id;
	const copy: MessageMenuItem[] = [
		{
			id: "copy-link",
			label: t({ message: "Copy link" }),
			icon: LuLink,
			run: () =>
				void copyToClipboard(
					`${PROTOCOL_SCHEME}://channels/${message.channelId}?thread=${thread}`,
				),
		},
		{
			id: "copy-message",
			label: t({ message: "Copy message" }),
			icon: LuCopy,
			run: () => void copyToClipboard(message.body),
		},
	];
	const state: MessageMenuItem[] = [
		...(onMarkUnread
			? [
					{
						id: "mark-unread" as const,
						label: t({ message: "Mark unread" }),
						icon: LuMail,
						run: onMarkUnread,
					},
				]
			: []),
		...(follow
			? [
					{
						id: "follow" as const,
						label: follow.following
							? t({ message: "Unfollow thread" })
							: t({ message: "Follow thread" }),
						icon: follow.following ? LuBellOff : LuBell,
						run: follow.onToggle,
					},
				]
			: []),
	];
	const change: MessageMenuItem[] = [
		...(onEdit
			? [
					{
						id: "edit" as const,
						label: t({ message: "Edit message" }),
						icon: LuPencil,
						run: onEdit,
					},
				]
			: []),
		...(onDelete
			? [
					{
						id: "delete" as const,
						label: t({ message: "Delete message" }),
						icon: LuTrash2,
						destructive: true,
						run: onDelete,
					},
				]
			: []),
	];
	return [copy, state, change].filter((group) => group.length > 0);
}
