import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useViewedChannelStore } from "renderer/routes/_authenticated/stores/viewedChannelStore";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { useChannelPanelStore } from "../../stores/channelPanelStore";
import { ChannelComposer } from "../ChannelComposer";
import { ChannelHeader, type ChannelTab } from "../ChannelHeader";
import { ChannelJoinBar } from "../ChannelJoinBar";
import { ChannelMembersDialog } from "../ChannelMembersDialog";
import type { ChannelPerson } from "../ChannelMessageRow";
import { ChannelPanel } from "../ChannelPanel";
import { ChannelSettingsDialog } from "../ChannelSettingsDialog";
import { ChannelTasksTab } from "../ChannelTasksTab";
import { ChannelTimeline } from "../ChannelTimeline";

const NOW_TICK_MS = 30_000;

interface ChannelScreenProps {
	channelId: string;
	thread?: string;
}

export function ChannelScreen({ channelId, thread }: ChannelScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const tick = useNow(NOW_TICK_MS);
	const now = new Date(Math.max(tick.getTime(), Date.now()));
	const utils = cloudTrpc.useUtils();
	const { people, currentUserId } = useOrganizationPeople();
	const peopleById = useMemo(
		() => new Map<string, ChannelPerson>(people.map((p) => [p.id, p])),
		[people],
	);
	const query = cloudTrpc.channel.get.useQuery({ channelId }, { retry: false });
	const channel = query.data;
	const [tab, setTab] = useState<ChannelTab>("messages");
	const [dialog, setDialog] = useState<
		"members" | "settings" | "archive" | null
	>(null);
	const [lastReadAtOpen, setLastReadAtOpen] = useState<number | null>(null);
	const openPanelTab = useChannelPanelStore((state) => state.open);
	const setViewedChannel = useViewedChannelStore((state) => state.setChannelId);

	useEffect(() => {
		setViewedChannel(channelId);
		return () => setViewedChannel(null);
	}, [channelId, setViewedChannel]);

	useEffect(() => {
		if (lastReadAtOpen === null && channel?.membership) {
			setLastReadAtOpen(channel.membership.lastReadSeq);
		}
	}, [channel, lastReadAtOpen]);

	const threadLabel = t({ message: "Thread" });
	useEffect(() => {
		if (!thread) return;
		openPanelTab(channelId, { kind: "thread", id: thread, label: threadLabel });
		void navigate({
			to: "/channels/$channelId",
			params: { channelId },
			search: {},
			replace: true,
		});
	}, [thread, channelId, openPanelTab, navigate, threadLabel]);

	const onError = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const refresh = () => void utils.channel.invalidate();
	const markRead = cloudTrpc.channel.markRead.useMutation();
	const join = cloudTrpc.channel.join.useMutation({
		onSuccess: refresh,
		onError,
	});
	const leave = cloudTrpc.channel.leave.useMutation({
		onSuccess: refresh,
		onError,
	});
	const archive = cloudTrpc.channel.archive.useMutation({
		onSuccess: () => {
			refresh();
			void navigate({ to: "/v2-workspaces" });
		},
		onError,
	});
	const setNotify = cloudTrpc.channel.setNotify.useMutation({
		onSuccess: refresh,
		onError,
	});
	const update = cloudTrpc.channel.update.useMutation({
		onSuccess: refresh,
		onError,
	});

	const isMember = channel?.membership != null;
	const markReadMutate = markRead.mutate;
	const markSeen = useCallback(() => {
		if (isMember && document.hasFocus()) markReadMutate({ channelId });
	}, [isMember, channelId, markReadMutate]);
	useEffect(() => {
		window.addEventListener("focus", markSeen);
		return () => window.removeEventListener("focus", markSeen);
	}, [markSeen]);

	const openThread = useCallback(
		(message: ChannelMessage) =>
			openPanelTab(channelId, {
				kind: "thread",
				id: message.id,
				label: threadLabel,
			}),
		[channelId, openPanelTab, threadLabel],
	);

	if (query.isError) {
		return (
			<StateScreenShell>
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					<Trans>Channel not found</Trans>
				</div>
			</StateScreenShell>
		);
	}
	if (!channel) return <StateScreenShell />;

	const canPost = isMember && channel.archivedAt === null;

	return (
		<div className="flex h-full w-full min-w-0 flex-1 overflow-hidden">
			<div className="flex min-w-0 flex-1 flex-col">
				<ChannelHeader
					channel={channel}
					tab={tab}
					onTabChange={setTab}
					onOpenMembers={() => setDialog("members")}
					onOpenSettings={() => setDialog("settings")}
					onArchive={() => setDialog("archive")}
					onLeave={() => leave.mutate({ channelId })}
					onSetNotify={(notify) => setNotify.mutate({ channelId, notify })}
				/>
				{tab === "messages" ? (
					<>
						<ChannelTimeline
							channelId={channelId}
							channelName={channel.name}
							lastReadSeq={lastReadAtOpen}
							peopleById={peopleById}
							currentUserId={currentUserId}
							canModerate={channel.canManage}
							now={now}
							onOpenThread={openThread}
							onLatestChange={markSeen}
						/>
						{canPost && currentUserId ? (
							<div className="shrink-0 px-4 pb-4">
								<ChannelComposer
									channelId={channelId}
									threadRootId={null}
									people={people}
									currentUserId={currentUserId}
									placeholder={t({ message: `Message #${channel.name}` })}
									autoFocus
								/>
							</div>
						) : (
							!isMember &&
							channel.archivedAt === null && (
								<ChannelJoinBar
									channelName={channel.name}
									isJoining={join.isPending}
									onJoin={() => join.mutate({ channelId })}
								/>
							)
						)}
					</>
				) : (
					<ChannelTasksTab
						taskProjectId={channel.taskProjectId}
						canManage={channel.canManage}
						onLinkProject={(taskProjectId) =>
							update.mutate({ channelId, taskProjectId })
						}
						onOpenTask={(task) =>
							openPanelTab(channelId, {
								kind: "task",
								id: task.id,
								label: task.label,
							})
						}
					/>
				)}
			</div>
			<ChannelPanel
				channelId={channelId}
				peopleById={peopleById}
				people={people}
				currentUserId={currentUserId}
				canModerate={channel.canManage}
				canPost={canPost}
				now={now}
			/>
			<ChannelMembersDialog
				open={dialog === "members"}
				onOpenChange={(open) => setDialog(open ? "members" : null)}
				channelId={channelId}
				channelName={channel.name}
				people={people}
				currentUserId={currentUserId}
				canManage={channel.canManage}
				canAdd={isMember || channel.canManage}
			/>
			{dialog === "settings" && (
				<ChannelSettingsDialog
					open
					onOpenChange={(open) => setDialog(open ? "settings" : null)}
					channel={channel}
				/>
			)}
			<DiscardConfirmDialog
				open={dialog === "archive"}
				onOpenChange={(open) => setDialog(open ? "archive" : null)}
				title={t({ message: `Archive #${channel.name}?` })}
				description={t({
					message: "No one can post in it, and it leaves everyone's sidebar.",
				})}
				confirmLabel={t({ message: "Archive" })}
				onConfirm={() => archive.mutate({ channelId })}
			/>
		</div>
	);
}
