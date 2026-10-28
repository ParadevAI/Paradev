import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
	LuBell,
	LuBellOff,
	LuCheck,
	LuCheckCheck,
	LuCopy,
	LuInfo,
	LuLogIn,
	LuLogOut,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { useChannelNotifyOptions } from "renderer/routes/_authenticated/_dashboard/hooks/useChannelNotifyOptions";
import { PROTOCOL_SCHEME } from "shared/constants";

type SidebarChannel = RouterOutputs["channel"]["list"][number];

interface ChannelContextMenuProps {
	channel: SidebarChannel;
	/** The channel on screen; leaving it moves away, as it may no longer load. */
	isActive: boolean;
	children: ReactNode;
}

/** Right-click on a sidebar channel: what Slack offers there that channels support. */
export function ChannelContextMenu({
	channel,
	isActive,
	children,
}: ChannelContextMenuProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { copyToClipboard } = useCopyToClipboard();
	const utils = cloudTrpc.useUtils();
	const options = {
		onSuccess: () => void utils.channel.invalidate(),
		onError: (error: unknown) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	};
	const markRead = cloudTrpc.channel.markRead.useMutation(options);
	const setNotify = cloudTrpc.channel.setNotify.useMutation(options);
	const setMuted = cloudTrpc.channel.setMuted.useMutation(options);
	const join = cloudTrpc.channel.join.useMutation(options);
	const leave = cloudTrpc.channel.leave.useMutation({
		...options,
		onSuccess: () => {
			options.onSuccess();
			if (isActive && channel.visibility === "private") {
				void navigate({ to: "/v2-workspaces" });
			}
		},
	});
	const [confirmingLeave, setConfirmingLeave] = useState(false);
	const channelId = channel.id;
	const notify = useChannelNotifyOptions();

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div>{children}</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-56">
				<ContextMenuItem
					onSelect={() =>
						void navigate({
							to: "/channels/$channelId",
							params: { channelId },
							search: { details: "about" },
						})
					}
				>
					<LuInfo />
					<Trans>Open channel details</Trans>
				</ContextMenuItem>
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuCopy />
						<Trans>Copy</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuItem
							onSelect={() => void copyToClipboard(`#${channel.name}`)}
						>
							<Trans>Copy name</Trans>
						</ContextMenuItem>
						<ContextMenuItem
							onSelect={() =>
								void copyToClipboard(
									`${PROTOCOL_SCHEME}://channels/${channelId}`,
								)
							}
						>
							<Trans>Copy link</Trans>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				{channel.isMember && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							disabled={!channel.hasUnread && channel.mentionCount === 0}
							onSelect={() => markRead.mutate({ channelId })}
						>
							<LuCheckCheck />
							<Trans>Mark as read</Trans>
						</ContextMenuItem>
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<LuBell />
								<Trans>Notifications</Trans>
							</ContextMenuSubTrigger>
							<ContextMenuSubContent>
								{notify.options.map((option) => (
									<ContextMenuItem
										key={option.value}
										onSelect={() =>
											setNotify.mutate({
												channelId,
												notify: notify.fromOption(option.value),
											})
										}
									>
										<span className="flex size-4 items-center justify-center">
											{notify.toOption(channel.notify) === option.value && (
												<LuCheck className="size-3.5" />
											)}
										</span>
										{option.label}
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
						<ContextMenuItem
							onSelect={() =>
								setMuted.mutate({ channelId, muted: !channel.muted })
							}
						>
							{channel.muted ? <LuBell /> : <LuBellOff />}
							{channel.muted ? (
								<Trans>Unmute channel</Trans>
							) : (
								<Trans>Mute channel</Trans>
							)}
						</ContextMenuItem>
					</>
				)}
				<ContextMenuSeparator />
				{channel.isMember ? (
					<ContextMenuItem
						variant="destructive"
						onSelect={() =>
							channel.visibility === "private"
								? setConfirmingLeave(true)
								: leave.mutate({ channelId })
						}
					>
						<LuLogOut />
						<Trans>Leave channel</Trans>
					</ContextMenuItem>
				) : (
					<ContextMenuItem onSelect={() => join.mutate({ channelId })}>
						<LuLogIn />
						<Trans>Join channel</Trans>
					</ContextMenuItem>
				)}
			</ContextMenuContent>
			<DiscardConfirmDialog
				open={confirmingLeave}
				onOpenChange={setConfirmingLeave}
				title={t({ message: `Leave #${channel.name}?` })}
				description={t({
					message: "It's private, so you'll need an invitation to rejoin.",
				})}
				confirmLabel={t({ message: "Leave" })}
				onConfirm={() => leave.mutate({ channelId })}
			/>
		</ContextMenu>
	);
}
