import { Trans, useLingui } from "@lingui/react/macro";
import {
	approvalAsker,
	deriveQueuedPrompts,
	displayText,
	launchConfigSelections,
	runningTurnId,
} from "@superset/chat/core";
import type { Decision } from "@superset/chat/protocol";
import {
	ItemBodiesProvider,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { ListEnd } from "lucide-react-native";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { ActionSheetIOS, Alert, Pressable, View } from "react-native";
import { Conversation } from "@/components/ai-elements/conversation";
import { Text } from "@/components/ui/text";
import {
	type ChatHost,
	createChatSessionClient,
	getChatTransport,
} from "@/lib/chat";
import { errorCopy } from "@/lib/errors";
import { usePendingChatLaunchStore } from "@/screens/(authenticated)/stores/pendingChatLaunchStore";
import type { PullRequestDiffstat } from "../../hooks/usePullRequestDiffstat";
import { useActiveChatStore } from "../../stores/activeChatStore";
import { useChatActivityStore } from "../../stores/chatActivityStore";
import {
	type ChatRow,
	chatRows,
	groupActivity,
	groupPositions,
	lastReplyKeys,
} from "../../utils/chatRows";
import {
	PULL_REQUEST_STATUS,
	type PullRequestStatus,
} from "../../utils/pullRequest";
import { ChatRowView } from "../ChatRowView";
import { Diffstat } from "../Diffstat";
import { DOCK_CHIP_HEIGHT, DockChip } from "./components/DockChip";
import { ScrollToBottom } from "./components/ScrollToBottom";
import { StickToBottom } from "./components/StickToBottom";
import { useTapHandlers } from "./hooks/useTapHandlers";

const CONFIG_OPTIONS_GRACE_MS = 1000;
const BANNER_SPACE = 36;

function activityTexts(
	activity: ChatRow[],
	snapshot: Parameters<typeof displayText>[0],
): Record<string, string> {
	return Object.fromEntries(
		activity.flatMap((row) =>
			row.kind === "item" &&
			(row.item.kind === "reasoning" || row.item.kind === "agent_message")
				? [[row.item.id, displayText(snapshot, row.item.id)]]
				: [],
		),
	);
}

export interface ChatAttachment {
	attachmentId: string;
	name: string;
	mimeType: string;
}

export interface ChatSessionViewHandle {
	send: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
}

interface ChatSessionViewProps {
	sessionId: string;
	workspaceId: string;
	host: ChatHost;
	hostUrl: string;
	onOpenSession: (sessionId: string) => void;
	onTap?: () => void;
	/** The newest pull request sets the mark and the diffstat. */
	pullRequestChip?: {
		label: string;
		status: PullRequestStatus;
		diffstat: PullRequestDiffstat | null;
	};
	onOpenPullRequests?: () => void;
}

/**
 * A chat-v3 session in place of a terminal. The composer below the screen
 * sends through `send`; prompts typed while the agent works join the host's
 * queue, the same one desktop shows.
 */
export const ChatSessionView = forwardRef<
	ChatSessionViewHandle,
	ChatSessionViewProps
>(function ChatSessionView(
	{
		sessionId,
		workspaceId,
		host,
		hostUrl,
		onOpenSession,
		onTap,
		pullRequestChip,
		onOpenPullRequests,
	},
	ref,
) {
	const { t } = useLingui();
	const { organizationId, machineId } = host;
	const client = useMemo(
		() =>
			createChatSessionClient({
				sessionId,
				host: { organizationId, machineId },
				hostUrl,
			}),
		[sessionId, organizationId, machineId, hostUrl],
	);
	useEffect(() => () => client.close(), [client]);

	const chat = useChatSession({ client });
	const groups = useTimeline(chat.snapshot);
	const rows = useMemo(
		() => groupActivity(chatRows(groups, chat.outbox)),
		[groups, chat.outbox],
	);
	const positions = useMemo(() => groupPositions(rows), [rows]);
	const replyEnds = useMemo(() => lastReplyKeys(rows), [rows]);
	const [dockHeight, setDockHeight] = useState(0);
	const queued = useMemo(
		() => deriveQueuedPrompts(chat.snapshot),
		[chat.snapshot],
	);
	const session = chat.snapshot.session;
	const queuePaused = session?.queuePaused === true;
	const queueControls = session?.queueControls === true;
	const harness = session?.harness;
	const turnId = runningTurnId(chat.snapshot.turns);

	const hasPendingLaunch = usePendingChatLaunchStore(
		(state) => sessionId in state.bySessionId,
	);
	const launchStarted = useRef(false);
	const configOptions = session?.configOptions;
	const agentStatus = session?.status;
	useEffect(() => {
		if (!hasPendingLaunch || launchStarted.current) return;
		if (chat.status !== "ready") return;
		const run = async (options: NonNullable<typeof configOptions>) => {
			launchStarted.current = true;
			const launch = usePendingChatLaunchStore.getState().take(sessionId);
			if (!launch) return;
			for (const selection of launchConfigSelections(options, launch)) {
				await chat
					.setConfigOption(selection.configId, selection.value)
					.catch(() => {});
			}
			if (launch.content.length > 0) chat.sendPrompt(launch.content);
		};
		if (configOptions) {
			void run(configOptions);
			return;
		}
		if (agentStatus !== "idle") return;
		const timer = setTimeout(() => void run([]), CONFIG_OPTIONS_GRACE_MS);
		return () => clearTimeout(timer);
	}, [hasPendingLaunch, chat, configOptions, agentStatus, sessionId]);

	const failAlert = useCallback(
		(title: string) => (cause: unknown) => Alert.alert(title, errorCopy(cause)),
		[],
	);

	const { respondToApproval } = chat;
	const loaded = chat.status === "ready";
	const onRespond = useCallback(
		(approvalId: string, decision: Decision) =>
			loaded
				? respondToApproval(approvalId, decision).catch(
						failAlert(t({ message: "Could not answer the agent" })),
					)
				: Promise.resolve(),
		[respondToApproval, loaded, failAlert, t],
	);

	const stop = useCallback(() => {
		if (!turnId || !loaded) return;
		void chat
			.cancelTurn(turnId, { pauseQueue: true })
			.catch(failAlert(t({ message: "Could not stop the agent" })));
	}, [chat, turnId, loaded, failAlert, t]);

	const branchFrom = useCallback(
		(itemId: string) => {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: [
						t({ message: "Branch from here" }),
						t({ message: "Cancel" }),
					],
					cancelButtonIndex: 1,
				},
				(index) => {
					if (index !== 0) return;
					const transport = getChatTransport(hostUrl);
					void transport
						.forkSession({
							commandId: randomUUID(),
							sessionId,
							workspaceId,
							fromItemId: itemId,
						})
						.then((forked) => {
							if (!forked) {
								Alert.alert(
									t({ message: "This agent can't branch a conversation" }),
								);
								return;
							}
							onOpenSession(forked.sessionId);
						})
						.catch(failAlert(t({ message: "Could not branch the chat" })));
				},
			);
		},
		[hostUrl, sessionId, workspaceId, onOpenSession, failAlert, t],
	);

	const availableModes = session?.availableModes;
	const modes = useMemo(() => availableModes ?? [], [availableModes]);
	const confirmedModeId = session?.modeId;
	const [pendingMode, setPendingMode] = useState<{
		modeId: string;
		from: string | undefined;
	}>();
	const pendingModeId =
		pendingMode && pendingMode.from === confirmedModeId
			? pendingMode.modeId
			: undefined;
	const selectMode = useCallback(
		(modeId: string) => {
			setPendingMode({ modeId, from: confirmedModeId });
			void chat.setMode(modeId).catch((cause: unknown) => {
				setPendingMode(undefined);
				failAlert(t({ message: "Could not change the mode" }))(cause);
			});
		},
		[chat, confirmedModeId, failAlert, t],
	);

	const steerQueued = useCallback(
		(itemId: string) =>
			void chat
				.steerQueuedPrompt(itemId)
				.catch(failAlert(t({ message: "Could not steer" }))),
		[chat, failAlert, t],
	);
	const removeQueued = useCallback(
		(itemId: string) =>
			void chat
				.removeQueuedPrompt(itemId)
				.catch(failAlert(t({ message: "Could not delete" }))),
		[chat, failAlert, t],
	);
	const resumeQueue = useCallback(
		() =>
			void chat
				.resumeQueue()
				.catch(failAlert(t({ message: "Could not resume" }))),
		[chat, failAlert, t],
	);

	const actions = {
		selectMode,
		stop,
		steerQueued,
		removeQueued,
		resumeQueue,
	};
	const actionsRef = useRef(actions);
	actionsRef.current = actions;
	useEffect(() => {
		useActiveChatStore.getState().publish(sessionId, {
			modes,
			currentModeId: pendingModeId ?? confirmedModeId,
			running: turnId !== null,
			queued,
			queuePaused,
			queueControls,
			selectMode: (modeId) => actionsRef.current.selectMode(modeId),
			stop: () => actionsRef.current.stop(),
			steerQueued: (itemId) => actionsRef.current.steerQueued(itemId),
			removeQueued: (itemId) => actionsRef.current.removeQueued(itemId),
			resumeQueue: () => actionsRef.current.resumeQueue(),
		});
	}, [
		sessionId,
		modes,
		pendingModeId,
		confirmedModeId,
		turnId,
		queued,
		queuePaused,
		queueControls,
	]);
	useEffect(
		() => () => useActiveChatStore.getState().clear(sessionId),
		[sessionId],
	);

	useImperativeHandle(
		ref,
		() => ({
			send: async (text: string, attachments: ChatAttachment[] = []) => {
				if (!text.trim() && attachments.length === 0) return;
				chat.sendPrompt([
					...(text.trim() ? [{ type: "text" as const, text }] : []),
					...attachments.map((attachment) => ({
						type: "attachment" as const,
						...attachment,
					})),
				]);
			},
		}),
		[chat],
	);

	const router = useRouter();
	const headerHeight = useHeaderHeight();
	const latest = useRef({ rows, snapshot: chat.snapshot });
	latest.current = { rows, snapshot: chat.snapshot };
	const openActivity = useCallback(
		(key: string) => {
			const { rows: current, snapshot } = latest.current;
			const row = current.find((candidate) => candidate.key === key);
			if (row?.kind !== "activity") return;
			useChatActivityStore
				.getState()
				.open(key, row.rows, activityTexts(row.rows, snapshot));
			router.push(`/(authenticated)/workspace/${workspaceId}/activity`);
		},
		[router, workspaceId],
	);
	const openActivityKey = useChatActivityStore((state) => state.openKey);
	useEffect(() => {
		if (!openActivityKey) return;
		const row = rows.find((candidate) => candidate.key === openActivityKey);
		if (row?.kind !== "activity") return;
		useChatActivityStore
			.getState()
			.publish(row.rows, activityTexts(row.rows, chat.snapshot));
	}, [openActivityKey, rows, chat.snapshot]);

	const renderRow = useCallback(
		({ item: row, index }: { item: ChatRow; index: number }) => {
			const position = positions[index] ?? "single";
			const parent =
				row.kind === "item"
					? approvalAsker(chat.snapshot.items, row.item)
					: undefined;
			const asker = parent
				? parent.title || t({ message: "Subagent" })
				: undefined;
			const endsGroup = position === "single" || position === "last";
			return (
				<View className={endsGroup ? "pb-5" : "pb-2.5"}>
					<ChatRowView
						asker={asker}
						harness={harness}
						hostUrl={hostUrl}
						onDiscardPrompt={chat.discardPrompt}
						onLongPressMessage={branchFrom}
						onOpenActivity={openActivity}
						onRespond={onRespond}
						onRetryPrompt={chat.retryPrompt}
						isLastReply={replyEnds.has(row.key)}
						row={row}
						text={
							row.kind === "item" &&
							(row.item.kind === "agent_message" ||
								row.item.kind === "reasoning")
								? displayText(chat.snapshot, row.item.id)
								: ""
						}
					/>
				</View>
			);
		},
		[
			harness,
			hostUrl,
			chat,
			onRespond,
			branchFrom,
			positions,
			replyEnds,
			openActivity,
			t,
		],
	);

	const tapHandlers = useTapHandlers(onTap);

	const banner =
		session?.status === "dead"
			? t({ message: "This chat has ended." })
			: chat.connection !== "open" && chat.status === "ready"
				? t({ message: "Reconnecting…" })
				: null;

	return (
		<View className="flex-1">
			{banner ? (
				<View
					className="bg-secondary absolute z-10 self-center rounded-full px-3.5 py-1.5"
					style={{ top: headerHeight + 8 }}
				>
					<Text className="text-foreground text-xs font-medium">{banner}</Text>
				</View>
			) : null}
			<ItemBodiesProvider requestItemBodies={chat.requestItemBodies}>
				<View className="flex-1" {...tapHandlers}>
					<Conversation
						contentContainerClassName="px-4"
						contentContainerStyle={{
							paddingTop: headerHeight + 16 + (banner ? BANNER_SPACE : 0),
						}}
						data={rows}
						keyExtractor={(row) => row.key}
						ListHeaderComponent={
							chat.hasOlder ? (
								<Pressable
									accessibilityRole="button"
									className="bg-secondary mb-4 self-center rounded-full px-3.5 py-1.5 active:opacity-70"
									onPress={() => void chat.loadOlder()}
								>
									<Text className="text-foreground text-xs font-medium">
										<Trans>Load earlier messages</Trans>
									</Text>
								</Pressable>
							) : null
						}
						ListFooterComponent={<View style={{ height: dockHeight + 8 }} />}
						keyboardDismissMode="interactive"
						renderItem={renderRow}
					>
						<StickToBottom inset={dockHeight} />
						<ScrollToBottom />
					</Conversation>
				</View>
			</ItemBodiesProvider>
			<View
				className="absolute inset-x-0 bottom-0 gap-2 px-3 pb-2"
				onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
				pointerEvents="box-none"
			>
				{pullRequestChip || queued.length > 0 ? (
					<View
						className="flex-row flex-wrap gap-2"
						pointerEvents="box-none"
						style={{ paddingRight: DOCK_CHIP_HEIGHT + 8 }}
					>
						{pullRequestChip && onOpenPullRequests ? (
							<DockChip
								icon={PULL_REQUEST_STATUS[pullRequestChip.status].icon}
								iconClassName={PULL_REQUEST_STATUS[pullRequestChip.status].ink}
								label={pullRequestChip.label}
								onPress={onOpenPullRequests}
							>
								{pullRequestChip.diffstat ? (
									<Diffstat
										{...pullRequestChip.diffstat}
										className="text-[15px]"
									/>
								) : null}
							</DockChip>
						) : null}
						{queued.length > 0 ? (
							<DockChip
								count={queued.length}
								icon={ListEnd}
								label={
									queuePaused
										? t({ message: "Queue paused" })
										: t({ message: "Queued" })
								}
								onPress={() =>
									router.push(
										`/(authenticated)/workspace/${workspaceId}/queued?session=${sessionId}`,
									)
								}
							/>
						) : null}
					</View>
				) : null}
			</View>
		</View>
	);
});
