import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useNow } from "renderer/hooks/useNow";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useChannelReadState } from "renderer/routes/_authenticated/hooks/useChannelReadState";
import { useViewedChannelStore } from "renderer/routes/_authenticated/stores/viewedChannelStore";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { useChannelPanelMode } from "../../hooks/useChannelPanelMode";
import { useChannelPanelStore } from "../../stores/channelPanelStore";
import { threadTabLabel } from "../../utils/threadTabLabel";
import { ChannelComposer } from "../ChannelComposer";
import {
	ChannelDetailsDialog,
	type ChannelDetailsTab,
} from "../ChannelDetailsDialog";
import { ChannelHeader, type ChannelTab } from "../ChannelHeader";
import { ChannelJoinBar } from "../ChannelJoinBar";
import type { ChannelPerson } from "../ChannelMessageRow";
import { ChannelPanel } from "../ChannelPanel";
import { ChannelPanelFrame } from "../ChannelPanelFrame";
import { ChannelTasksTab } from "../ChannelTasksTab";
import { ChannelTimeline } from "../ChannelTimeline";
import { EditDescriptionDialog } from "../EditDescriptionDialog";
import { RenameChannelDialog } from "../RenameChannelDialog";

const NOW_TICK_MS = 30_000;

interface ChannelScreenProps {
	channelId: string;
	thread?: string;
	/** Scrolls to this message, then clears itself from the URL. */
	message?: string;
	/** Opens the details dialog on this tab, then clears itself from the URL. */
	details?: ChannelDetailsTab;
	/** Replaces the channel header, for a DM drawn as its Dev's page. */
	renderHeader?: (panel: { isOpen: boolean; toggle: () => void }) => ReactNode;
	/** Replaces the channel intro at the top of the timeline. */
	intro?: ReactNode;
	/** Replaces the tabbed panel with one view, and turns off threads. */
	renderPanel?: (panel: { hide: () => void }) => ReactNode;
	/** Shown instead of the timeline and composer, beside the same header and panel. */
	body?: ReactNode;
	composerPlaceholder?: string;
}

export function ChannelScreen({
	channelId,
	thread,
	message: messageParam,
	details: detailsParam,
	renderHeader,
	intro,
	renderPanel,
	body,
	composerPlaceholder,
}: ChannelScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const tick = useNow(NOW_TICK_MS);
	const now = new Date(Math.max(tick.getTime(), Date.now()));
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const { people, currentUserId } = useOrganizationPeople();
	const peopleById = useMemo(
		() => new Map<string, ChannelPerson>(people.map((p) => [p.id, p])),
		[people],
	);
	const query = cloudTrpc.channel.get.useQuery({ channelId }, { retry: false });
	const channel = query.data;
	const [tab, setTab] = useState<ChannelTab>("messages");
	const [details, setDetails] = useState<ChannelDetailsTab | null>(null);
	const [archiving, setArchiving] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [describing, setDescribing] = useState(false);
	/** The read point when the channel opened; the "New" line stays here. */
	const [ghost, setGhost] = useState<number | null | undefined>(undefined);
	/** Set by Mark unread; auto-marking waits until Esc or leaving. */
	const [manualUnread, setManualUnread] = useState(false);
	const mainRef = useRef<HTMLDivElement>(null);
	const { applyChannelRead } = useChannelReadState();
	const openPanelTab = useChannelPanelStore((state) => state.open);
	const panelWidth = useChannelPanelStore((state) => state.width);
	const setPanelWidth = useChannelPanelStore((state) => state.setWidth);
	const panel = useChannelPanelMode(channelId);
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
	const setViewedThread = useViewedChannelStore(
		(state) => state.setThreadRootId,
	);
	const openThreadKey = useChannelPanelStore((state) => {
		const channelPanel = state.panels[channelId];
		return channelPanel?.isOpen && channelPanel.activeKey?.startsWith("thread:")
			? channelPanel.activeKey
			: null;
	});

	useEffect(() => {
		setViewedChannel(channelId);
		return () => setViewedChannel(null);
	}, [channelId, setViewedChannel]);

	useEffect(() => {
		setViewedThread(openThreadKey?.slice("thread:".length) ?? null);
		return () => setViewedThread(null);
	}, [openThreadKey, setViewedThread]);

	const lastReadSeq = channel?.membership?.lastReadSeq ?? null;
	if (ghost === undefined && channel && !query.isFetching) {
		setGhost(lastReadSeq);
	}

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

	const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
	useEffect(() => {
		if (!messageParam) return;
		setTab("messages");
		setFocusMessageId(messageParam);
		void navigate({
			to: "/channels/$channelId",
			params: { channelId },
			search: {},
			replace: true,
		});
	}, [messageParam, channelId, navigate]);
	const clearFocusMessage = useCallback(() => setFocusMessageId(null), []);

	useEffect(() => {
		if (!detailsParam) return;
		setDetails(detailsParam);
		void navigate({
			to: "/channels/$channelId",
			params: { channelId },
			search: {},
			replace: true,
		});
	}, [detailsParam, channelId, navigate]);

	const onError = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const refresh = () => void utils.channel.invalidate();
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;
	const resyncReadState = () => {
		void utils.channel.get.invalidate({ channelId });
		void utils.channel.list.invalidate();
	};
	const markRead = cloudTrpc.channel.markRead.useMutation({
		onSuccess: (state) => applyChannelRead(channelId, state),
		onError: resyncReadState,
	});
	const markUnread = cloudTrpc.channel.markUnread.useMutation({
		onSuccess: (state) => applyChannelRead(channelId, state),
		onError: (error) => {
			setManualUnread(false);
			resyncReadState();
			onError(error);
		},
	});
	const setMuted = cloudTrpc.channel.setMuted.useMutation({
		onSuccess: refresh,
		onError,
	});
	const join = cloudTrpc.channel.join.useMutation({
		onSuccess: refresh,
		onError,
	});
	const leave = cloudTrpc.channel.leave.useMutation({
		onSuccess: () => {
			refresh();
			if (channel?.visibility === "private") {
				void navigate({ to: "/v2-workspaces" });
			}
		},
		onError,
	});
	const [confirmingLeave, setConfirmingLeave] = useState(false);
	const requestLeave = () => {
		if (channel?.visibility === "private") setConfirmingLeave(true);
		else leave.mutate({ channelId });
	};
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
	const setSuppressBroadcasts =
		cloudTrpc.channel.setSuppressBroadcasts.useMutation({
			onSuccess: refresh,
			onError,
		});
	const update = cloudTrpc.channel.update.useMutation({
		onSuccess: refresh,
		onError,
	});

	const isMember = channel?.membership != null;
	const markReadMutate = markRead.mutate;
	const onSeen = useCallback(
		(seq: number, saveGhost: boolean) => {
			if (saveGhost) {
				setGhost((current) => (current === null ? lastReadSeq : current));
			}
			applyChannelRead(channelId, {
				lastReadSeq: seq,
				hasUnread: false,
				mentionCount: 0,
			});
			markReadMutate({ channelId, seq });
		},
		[channelId, lastReadSeq, applyChannelRead, markReadMutate],
	);
	const markAllRead = useCallback(() => {
		setGhost(null);
		setManualUnread(false);
		markReadMutate({ channelId }, { onError: onErrorRef.current });
	}, [channelId, markReadMutate]);
	const { data: channelRows } = cloudTrpc.channel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const listRow = channelRows?.find((row) => row.id === channelId);
	const hasSomethingToMark =
		ghost !== null ||
		manualUnread ||
		listRow?.hasUnread === true ||
		(listRow?.mentionCount ?? 0) > 0;
	const hasSomethingToMarkRef = useRef(hasSomethingToMark);
	hasSomethingToMarkRef.current = hasSomethingToMark;
	const onMarkUnread = useCallback(
		(message: ChannelMessage) => {
			setGhost(null);
			setManualUnread(true);
			markUnread.mutate({ messageId: message.id });
		},
		[markUnread.mutate],
	);

	useEffect(() => {
		if (!isMember) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key !== "Escape" ||
				event.shiftKey ||
				event.repeat ||
				event.defaultPrevented
			) {
				return;
			}
			const target = event.target as Node | null;
			const inChannel =
				target === document.body ||
				(target !== null && mainRef.current?.contains(target));
			const overlayOpen = document.querySelector(
				'[role="dialog"], [role="menu"]',
			);
			if (!inChannel || overlayOpen || !hasSomethingToMarkRef.current) return;
			markAllRead();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isMember, markAllRead]);

	const openThread = useCallback(
		(message: ChannelMessage, replaceKey?: string) =>
			openPanelTab(
				channelId,
				{
					kind: "thread",
					id: message.id,
					label: threadTabLabel(message.body, threadLabel),
				},
				{ replaceKey },
			),
		[channelId, openPanelTab, threadLabel],
	);
	const openTask = useCallback(
		(task: { id: string; label: string }, replaceKey?: string) =>
			openPanelTab(
				channelId,
				{ kind: "task", id: task.id, label: task.label },
				{ replaceKey },
			),
		[channelId, openPanelTab],
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
		<div
			ref={setContainer}
			data-channel-screen
			className="flex h-full w-full min-w-0 flex-1 overflow-hidden"
		>
			<div
				ref={mainRef}
				className="flex min-w-0 flex-1 flex-col overflow-hidden"
			>
				{renderHeader ? (
					renderHeader({ isOpen: panel.isOpen, toggle: panel.toggle })
				) : (
					<ChannelHeader
						channel={channel}
						isPanelOpen={panel.isOpen}
						onTogglePanel={panel.toggle}
						tab={tab}
						onTabChange={setTab}
						onOpenDetails={setDetails}
						onArchive={() => setArchiving(true)}
						onLeave={requestLeave}
						onToggleMute={() =>
							setMuted.mutate({
								channelId,
								muted: !channel.membership?.muted,
							})
						}
					/>
				)}
				{body ? (
					body
				) : tab === "messages" ? (
					<>
						<ChannelTimeline
							channelId={channelId}
							channel={channel}
							onAddPeople={
								isMember || channel.canManage
									? () => setDetails("members")
									: undefined
							}
							onRename={channel.canManage ? () => setRenaming(true) : undefined}
							onEditDescription={
								channel.canManage ? () => setDescribing(true) : undefined
							}
							lineSeq={manualUnread ? lastReadSeq : ghost}
							onOpenedRead={() => setGhost(null)}
							lastReadSeq={lastReadSeq}
							canAutoMark={
								isMember && !manualUnread && panel.mode !== "expanded"
							}
							onSeen={onSeen}
							onMarkAllRead={markAllRead}
							onMarkUnread={isMember ? onMarkUnread : undefined}
							peopleById={peopleById}
							currentUserId={currentUserId}
							canModerate={channel.canManage}
							canReact={canPost}
							now={now}
							onOpenThread={renderPanel ? undefined : openThread}
							intro={intro}
							focusMessageId={focusMessageId}
							onFocusedMessage={clearFocusMessage}
						/>
						{canPost && currentUserId ? (
							<div className="shrink-0 px-4 pb-4">
								<ChannelComposer
									channelId={channelId}
									threadRootId={null}
									people={people}
									currentUserId={currentUserId}
									placeholder={
										composerPlaceholder ??
										t({ message: `Message #${channel.name}` })
									}
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
					<ChannelTasksTab channelId={channelId} canAdd={canPost} />
				)}
			</div>
			<ChannelPanelFrame
				mode={panel.mode}
				containerWidth={containerWidth}
				width={panelWidth}
				onWidthChange={setPanelWidth}
				onCollapse={panel.hide}
			>
				{renderPanel ? (
					renderPanel({ hide: panel.hide })
				) : (
					<ChannelPanel
						channelId={channelId}
						isFullScreen={panel.mode === "expanded"}
						onToggleFullScreen={panel.toggleFullScreen}
						onHide={panel.hide}
						onOpenThread={openThread}
						onOpenTask={openTask}
						peopleById={peopleById}
						people={people}
						currentUserId={currentUserId}
						canModerate={channel.canManage}
						canPost={canPost}
						now={now}
					/>
				)}
			</ChannelPanelFrame>
			<ChannelDetailsDialog
				open={details !== null}
				onOpenChange={(open) => {
					if (!open) setDetails(null);
				}}
				tab={details ?? "about"}
				onTabChange={setDetails}
				channel={channel}
				peopleById={peopleById}
				currentUserId={currentUserId}
				onSetNotify={(notify) => setNotify.mutate({ channelId, notify })}
				onSetSuppressBroadcasts={(suppressBroadcasts) =>
					setSuppressBroadcasts.mutate({ channelId, suppressBroadcasts })
				}
				onLeave={() => {
					setDetails(null);
					requestLeave();
				}}
				onArchive={() => {
					setDetails(null);
					setArchiving(true);
				}}
			/>
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
