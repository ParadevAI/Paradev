import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useViewedChannelStore } from "renderer/routes/_authenticated/stores/viewedChannelStore";
import { useChannelAgents } from "../../hooks/useChannelAgents";
import { useChannelPaneMode } from "../../hooks/useChannelPaneMode";
import { useChannelCoordinatorStore } from "../../stores/channelCoordinatorStore";
import { useChannelPaneStore } from "../../stores/channelPaneStore";
import { ChannelHeader } from "../ChannelHeader";
import { ChannelPane } from "../ChannelPane";
import { coordinatorAgentLabel } from "../ChannelPane/utils/coordinatorAgents";
import { ChannelPanelFrame } from "../ChannelPanelFrame";
import { EditDescriptionDialog } from "../EditDescriptionDialog";
import type { ChannelPerson } from "../MessageBody";
import { RenameChannelDialog } from "../RenameChannelDialog";
import { CoordinatorChat } from "./components/CoordinatorChat";
import { StartCoordinator } from "./components/StartCoordinator";
import { useStartCoordinator } from "./hooks/useStartCoordinator";

interface StreamScreenProps {
	channelId: string;
	/** Opens this log entry's thread in the pane, then clears itself from the URL. */
	thread?: string;
}

/**
 * A channel: the coordinator's chat in the middle, the agents and the log in
 * the pane. The channel underneath is the channel's record: its name, goal,
 * people and append log.
 */
export function ChannelView({ channelId, thread }: StreamScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const { people, currentUserId } = useOrganizationPeople();
	const peopleById = useMemo(
		() => new Map<string, ChannelPerson>(people.map((p) => [p.id, p])),
		[people],
	);
	const query = cloudTrpc.channel.get.useQuery({ channelId }, { retry: false });
	const channel = query.data;
	const now = useMemo(() => new Date(), []);
	const [archiving, setArchiving] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [describing, setDescribing] = useState(false);
	const [confirmingLeave, setConfirmingLeave] = useState(false);
	const push = useChannelPaneStore((state) => state.push);
	const reset = useChannelPaneStore((state) => state.reset);
	const paneWidth = useChannelPaneStore((state) => state.width);
	const setPaneWidth = useChannelPaneStore((state) => state.setWidth);
	const pane = useChannelPaneMode(channelId);
	const coordinator = useChannelCoordinatorStore(
		(state) => state.byChannelId[channelId] ?? null,
	);
	const start = useStartCoordinator(channelId, channel);
	const chatEnabled = useAcpChatEnabled();
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	useEffect(() => {
		if (!container) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setContainerWidth(entry.contentRect.width);
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, [container]);
	const setViewedChannel = useViewedChannelStore((state) => state.setChannelId);
	useEffect(() => {
		setViewedChannel(channelId);
		return () => setViewedChannel(null);
	}, [channelId, setViewedChannel]);
	useEffect(() => {
		if (!thread) return;
		push(channelId, { kind: "thread", id: thread });
		void navigate({
			to: "/channels/$channelId",
			params: { channelId },
			search: {},
			replace: true,
		});
	}, [thread, channelId, push, navigate]);

	const onError = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const refresh = () => void utils.channel.invalidate();
	const setMuted = cloudTrpc.channel.setMuted.useMutation({
		onSuccess: refresh,
		onError,
	});
	const leave = cloudTrpc.channel.leave.useMutation({
		onSuccess: () => {
			refresh();
			void navigate({ to: "/v2-workspaces" });
		},
		onError,
	});
	const archive = cloudTrpc.channel.archive.useMutation({
		onSuccess: () => {
			refresh();
			void navigate({ to: "/v2-workspaces" });
		},
		onError,
	});
	const update = cloudTrpc.channel.update.useMutation({
		onSuccess: refresh,
		onError,
	});
	const { show } = pane;
	const openOverview = useCallback(() => {
		reset(channelId);
		show();
	}, [channelId, reset, show]);
	const { agents, isReady: agentsReady } = useChannelAgents(
		channel?.name ?? "",
	);
	// The pane opens by itself the moment a channel gets its first agent, then
	// follows whatever the person last chose.
	const agentsSeen = useRef<number | null>(null);
	useEffect(() => {
		if (!agentsReady) return;
		const before = agentsSeen.current;
		agentsSeen.current = agents.length;
		if (before === 0 && agents.length > 0) show();
	}, [agentsReady, agents.length, show]);

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

	const isMember = channel.membership != null;
	const canPost = isMember && channel.archivedAt === null;
	const onRename = channel.canManage ? () => setRenaming(true) : undefined;
	const onEditDescription = channel.canManage
		? () => setDescribing(true)
		: undefined;
	const requestLeave = () => {
		if (channel.visibility === "private") setConfirmingLeave(true);
		else leave.mutate({ channelId });
	};

	return (
		<div
			ref={setContainer}
			data-channel-screen
			className="@container flex h-full w-full min-w-0 flex-1 overflow-hidden"
		>
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<ChannelHeader
					channel={channel}
					coordinator={
						coordinator
							? {
									label: coordinatorAgentLabel(coordinator.agentId),
									busy: agents.some((agent) => agent.state === "working"),
								}
							: undefined
					}
					isPaneOpen={pane.isOpen}
					onTogglePane={pane.toggle}
					onOpenOverview={openOverview}
					onOpenCoordinator={() => {
						reset(channelId);
						push(channelId, { kind: "coordinator" });
						show();
					}}
					onOpenMembers={() => push(channelId, { kind: "members" })}
					onOpenSettings={() => push(channelId, { kind: "settings" })}
					onRename={onRename}
					onEditDescription={onEditDescription}
					onArchive={() => setArchiving(true)}
					onLeave={requestLeave}
					onToggleMute={() =>
						setMuted.mutate({
							channelId,
							muted: !channel.membership?.muted,
						})
					}
				/>
				{coordinator ? (
					<CoordinatorChat
						channelId={channelId}
						channelName={channel.name}
						coordinator={coordinator}
					/>
				) : (
					<StartCoordinator
						channel={channel}
						chatEnabled={chatEnabled}
						onStart={(workspaceId, prompt, goal) => {
							if (goal !== (channel.description ?? "")) {
								update.mutate({ channelId, description: goal || null });
							}
							start(workspaceId, prompt, goal || null);
						}}
					/>
				)}
			</div>
			<ChannelPanelFrame
				mode={pane.mode}
				containerWidth={containerWidth}
				width={paneWidth}
				onWidthChange={setPaneWidth}
				onCollapse={pane.hide}
			>
				<ChannelPane
					channelId={channelId}
					channel={channel}
					isFullScreen={pane.mode === "expanded"}
					onToggleFullScreen={pane.toggleFullScreen}
					onHide={pane.hide}
					peopleById={peopleById}
					people={people}
					currentUserId={currentUserId}
					canModerate={channel.canManage}
					canPost={canPost}
					now={now}
					onRename={onRename}
					onEditDescription={onEditDescription}
					onLeave={requestLeave}
					onArchive={() => setArchiving(true)}
				/>
			</ChannelPanelFrame>
			<EditDescriptionDialog
				open={describing}
				onOpenChange={setDescribing}
				description={channel.description}
				onSave={(description) => update.mutate({ channelId, description })}
			/>
			<RenameChannelDialog
				open={renaming}
				onOpenChange={setRenaming}
				name={channel.name}
				onRename={(name) => update.mutate({ channelId, name })}
			/>
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
			<DiscardConfirmDialog
				open={archiving}
				onOpenChange={setArchiving}
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
