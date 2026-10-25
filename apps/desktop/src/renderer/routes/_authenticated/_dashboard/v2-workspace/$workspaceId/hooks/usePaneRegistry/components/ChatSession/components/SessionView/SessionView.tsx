import { Trans, useLingui } from "@lingui/react/macro";
import type { SessionClient } from "@superset/chat/client";
import {
	deriveQueuedPrompts,
	runningTurnId as findRunningTurnId,
	launchConfigSelections,
	userMessageText,
} from "@superset/chat/core";
import type {
	AvailableCommand,
	BackgroundTask,
	Decision,
	SessionConfigOption,
	SessionState,
	UserContent,
} from "@superset/chat/protocol";
import {
	useApprovals,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { ComposerDropZone } from "@superset/chat-ui/ComposerDropZone";
import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import { ChatHistorySidebarScroller } from "@superset/ui/chat-history-sidebar";
import { toast } from "@superset/ui/sonner";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";
import { useStableList } from "renderer/hooks/useStableList";
import type { OpenFile } from "../../../../../../types";
import {
	ChatPaneActionsProvider,
	type OpenLink,
	type OpenPage,
} from "../../providers/ChatPaneActionsProvider";
import type { ChatEditRequest, ChatForkTarget } from "../../types";
import { buildChatHandoffTranscript } from "../../utils/chatHandoffTranscript";
import { heldPromptQueue } from "../../utils/heldPromptQueue";
import { editableMessageIds, rewindTranscript } from "../../utils/messageEdit";
import { promptHistory } from "../../utils/promptHistory";
import { railMessages } from "../../utils/railMessages";
import {
	type AgentChoice,
	type AgentSwitcher,
	Composer,
	type ComposerHandle,
	prependToDraft,
} from "../Composer";
import { ConnectionNotice } from "../ConnectionNotice";
import { SessionHeader } from "../SessionHeader";
import { SubagentView } from "../SubagentView";
import { Transcript } from "../Transcript";
import { useChildrenByParent } from "../Transcript/hooks/useChildrenByParent";
import { NestedItemsProvider } from "../Transcript/providers/NestedItemsProvider";
import { TranscriptPluginsProvider } from "../Transcript/providers/TranscriptPluginsProvider";
import {
	type DrawerExit,
	WorkDrawer,
	type WorkDrawerHandle,
} from "../WorkDrawer";
import { useMainSend } from "./hooks/useMainSend";
import { useMoveToBackground } from "./hooks/useMoveToBackground";
import { useSubagentNavigation } from "./hooks/useSubagentNavigation";
import { useSubagentTarget } from "./hooks/useSubagentTarget";
import { escapeBack } from "./utils/escapeBack";

const RESUME_FOLLOW_PX = 24;
const NO_COMMANDS: AvailableCommand[] = [];
const NO_CONFIG_OPTIONS: SessionConfigOption[] = [];
const NO_TASKS: BackgroundTask[] = [];

const MODEL_OPTIONS_GRACE_MS = 1000;

function contentText(content: UserContent[]): string {
	return userMessageText({ content });
}

export function SessionView({
	presetId,
	agentLabel,
	agentSwitch,
	canForkToWorktree,
	chatKey,
	client,
	draftKey,
	headerLeft,
	held,
	isActive,
	onModeChange,
	pendingPrompts,
	preferredModelLabel,
	onPendingPromptsSent,
	onFork,
	onEditMessage,
	onUserPrompt,
	onSessionState,
	openFile,
	openPage,
	openLink,
	onOpenHistory,
	workspaceId,
}: {
	client: SessionClient;
	chatKey: string;
	presetId?: string;
	draftKey: string;
	workspaceId: string;
	headerLeft?: ReactNode;
	held?: {
		notice: ReactNode;
		queued: UserContent[][];
		onQueue: (content: UserContent[]) => void;
	};
	isActive?: boolean;
	pendingPrompts: UserContent[][];
	/** Selected by name once the agent lists its models, before the first prompt goes out. */
	preferredModelLabel?: string;
	onPendingPromptsSent: () => void;
	onSessionState?: (session: SessionState | null) => void;
	/** The mode the user picked, so a resumed session can start in it again. */
	onModeChange?: (modeId: string) => void;
	/**
	 * Absent when the agent cannot branch its own session. The transcript is
	 * built here because only this view holds the timeline; a branch into
	 * another worktree cannot resume the session and is told it instead.
	 */
	onFork?: ((target: ChatForkTarget, transcript: string) => void) | undefined;
	canForkToWorktree?: boolean;
	onEditMessage?: (request: ChatEditRequest) => void;
	/** Called when the user sends a message, as opposed to anything sent for them. */
	onUserPrompt?: () => void;
	/** Names the speaker in a handed-over transcript. */
	agentLabel?: string;
	/** The transcript goes with the switch: the next agent cannot load this session. */
	agentSwitch?: {
		currentPresetId: string;
		agents: AgentChoice[];
		onSwitch: (
			presetId: string,
			model: { id: string; label: string } | null,
			transcript: string,
			currentModeId: string | undefined,
		) => void;
	};
	openFile?: OpenFile;
	openPage?: OpenPage;
	openLink?: OpenLink;
	/** Opens the pane header's chat history picker, as `/resume` does. */
	onOpenHistory?: () => void;
}) {
	const { t } = useLingui();
	const session = useChatSession({ client });
	const composerRef = useRef<ComposerHandle>(null);
	const drawerRef = useRef<WorkDrawerHandle>(null);
	const paneRef = useRef<HTMLDivElement>(null);
	const { outbox, discardPrompt } = session;
	const openDraftKey = useRef(draftKey);
	const restoreText = useCallback(
		(text: string, originKey: string) => {
			if (originKey !== openDraftKey.current) {
				prependToDraft(originKey, [text], originKey === draftKey);
				return;
			}
			composerRef.current?.appendText(text);
			composerRef.current?.focus();
		},
		[draftKey],
	);
	useEffect(() => {
		const failed = outbox.filter(
			(entry) =>
				entry.state === "failed" &&
				entry.content.every((part) => part.type === "text"),
		);
		if (failed.length === 0) return;
		for (const entry of failed) {
			discardPrompt(entry.clientId);
			restoreText(contentText(entry.content), draftKey);
		}
		toast.error(
			t({ message: "Couldn't send your message. It's back in the composer." }),
		);
	}, [outbox, discardPrompt, restoreText, draftKey, t]);
	const outboxRef = useRef(outbox);
	outboxRef.current = outbox;
	useEffect(
		() => () => {
			const unsent = outboxRef.current
				.filter(
					(entry) =>
						entry.state === "failed" ||
						(entry.state === "queued" && entry.attempts === 0),
				)
				.map((entry) => contentText(entry.content))
				.filter(Boolean);
			if (unsent.length > 0) prependToDraft(draftKey, unsent);
		},
		[draftKey],
	);
	const timeline = useTimeline(session.snapshot, { nestChildItems: true });
	const rail = useStableList(
		useMemo(() => railMessages(timeline), [timeline]),
		(previous, next) =>
			previous.id === next.id &&
			previous.role === next.role &&
			previous.preview === next.preview,
	);
	const approvals = useApprovals(session.snapshot);
	const harness = session.snapshot.session?.harness;
	const history = useStableList(
		useMemo(() => promptHistory(timeline, harness), [timeline, harness]),
	);

	const configOptions = session.snapshot.session?.configOptions;
	const agentStatus = session.snapshot.session?.status;
	const [modelSettled, setModelSettled] = useState(
		preferredModelLabel === undefined,
	);
	const modelRequested = useRef(false);
	useEffect(() => {
		if (modelSettled || session.status !== "ready") return;
		if (configOptions === undefined) {
			// An agent that reports no options never sends them.
			if (agentStatus !== "idle") return;
			const timer = setTimeout(
				() => setModelSettled(true),
				MODEL_OPTIONS_GRACE_MS,
			);
			return () => clearTimeout(timer);
		}
		if (modelRequested.current) return;
		const [selection] = launchConfigSelections(configOptions, {
			modelLabel: preferredModelLabel ?? null,
			effortLabel: null,
		});
		if (!selection) {
			setModelSettled(true);
			return;
		}
		modelRequested.current = true;
		void session
			.setConfigOption(selection.configId, selection.value)
			.finally(() => setModelSettled(true));
	}, [agentStatus, configOptions, modelSettled, preferredModelLabel, session]);

	const pendingSentRef = useRef(false);
	useEffect(() => {
		if (held || pendingPrompts.length === 0 || pendingSentRef.current) return;
		if (session.status !== "ready" || !modelSettled) return;
		pendingSentRef.current = true;
		for (const prompt of pendingPrompts) session.sendPrompt(prompt);
		onPendingPromptsSent();
	}, [held, pendingPrompts, session, onPendingPromptsSent, modelSettled]);

	const sessionState = session.snapshot.session;
	useEffect(() => {
		onSessionState?.(sessionState ?? null);
	}, [sessionState, onSessionState]);

	const runningTurnId = useMemo(
		() => findRunningTurnId(session.snapshot.turns),
		[session.snapshot.turns],
	);

	const snapshotItems = session.snapshot.items;
	const queuedPrompts = useStableList(
		useMemo(
			() => deriveQueuedPrompts({ items: snapshotItems }),
			[snapshotItems],
		),
	);

	const focusComposer = useCallback(() => composerRef.current?.focus(), []);
	const [revealMessageId, setRevealMessageId] = useState<string | null>(null);
	const clearRevealMessage = useCallback(() => setRevealMessageId(null), []);
	const returnToComposer = useCallback(
		(exit: DrawerExit) => composerRef.current?.returnFocus(exit === "history"),
		[],
	);
	const appendToComposer = useCallback(
		(text: string) => composerRef.current?.appendText(text),
		[],
	);
	const enterDrawer = useCallback(
		(options: { actionableOnly: boolean }) =>
			drawerRef.current?.focusLast(options) ?? false,
		[],
	);
	const timelineRef = useRef(timeline);
	timelineRef.current = timeline;
	const snapshotRef = useRef(session.snapshot);
	snapshotRef.current = session.snapshot;
	const forkWithTranscript = useCallback(
		(target: ChatForkTarget) =>
			onFork?.(
				target,
				buildChatHandoffTranscript(
					timelineRef.current,
					snapshotRef.current,
					agentLabel ?? "Agent",
				),
			),
		[onFork, agentLabel],
	);
	const agentSwitcher = useMemo<AgentSwitcher | undefined>(
		() =>
			agentSwitch && {
				currentPresetId: agentSwitch.currentPresetId,
				agents: agentSwitch.agents,
				onSwitch: (presetId, model) =>
					agentSwitch.onSwitch(
						presetId,
						model,
						buildChatHandoffTranscript(
							timelineRef.current,
							snapshotRef.current,
							agentLabel ?? "Agent",
						),
						snapshotRef.current.session?.modeId,
					),
			},
		[agentSwitch, agentLabel],
	);
	const {
		cancelTurn,
		loadOlder,
		respondToApproval,
		sendPrompt,
		setConfigOption,
		setMode,
		stopBackgroundTask,
	} = session;
	const loaded = session.status === "ready";
	const onRespond = useCallback(
		(approvalId: string, decision: Decision) => {
			if (loaded) void respondToApproval(approvalId, decision);
		},
		[respondToApproval, loaded],
	);
	const onSetConfigOption = useCallback(
		(configId: string, value: string) => void setConfigOption(configId, value),
		[setConfigOption],
	);
	const onSetMode = useCallback(
		(modeId: string) => {
			onModeChange?.(modeId);
			void setMode(modeId);
		},
		[onModeChange, setMode],
	);
	const editableIds = useMemo(
		() => editableMessageIds(timeline, harness),
		[timeline, harness],
	);
	const editable = onEditMessage !== undefined && held === undefined;
	const editMessage = useMemo(
		() =>
			editable && onEditMessage
				? (itemId: string, text: string) => {
						if (runningTurnId) {
							toast.error(
								t({ message: "Stop the agent before you edit a message" }),
							);
							return;
						}
						onEditMessage({
							itemId,
							messageText: text,
							transcript: rewindTranscript(
								timelineRef.current,
								itemId,
								snapshotRef.current,
								agentLabel ?? "Agent",
							),
						});
					}
				: undefined,
		[editable, onEditMessage, runningTurnId, agentLabel, t],
	);
	const holdPrompt = held?.onQueue;
	const onAnswerFailed = useCallback(
		(content: UserContent[]) => {
			restoreText(contentText(content), draftKey);
			toast.error(
				t({
					message: "Couldn't send your message. It's back in the composer.",
				}),
			);
		},
		[restoreText, draftKey, t],
	);
	const onSend = useMainSend({
		approvals,
		holdPrompt,
		loaded,
		onAnswerFailed,
		onUserPrompt,
		respondToApproval,
		runningTurnId,
		sendPrompt,
	});
	const {
		focusedId: focusedSubagentId,
		openSubagent,
		goBack,
	} = useSubagentNavigation({
		chatKey,
		items: session.snapshot.items,
	});
	const shownSubagentId = useRef(focusedSubagentId);
	useEffect(() => {
		if (shownSubagentId.current === focusedSubagentId) return;
		shownSubagentId.current = focusedSubagentId;
		focusComposer();
	}, [focusedSubagentId, focusComposer]);
	const restoreUnsent = useCallback(
		(content: UserContent[], originKey: string) =>
			restoreText(contentText(content), originKey),
		[restoreText],
	);
	const onStopTask = useCallback(
		(taskId: string) =>
			void stopBackgroundTask(taskId)
				.then((stopped) => {
					if (!stopped) throw new Error("the agent did not stop the task");
				})
				.catch((error: unknown) => {
					console.warn("[SessionView] could not stop task", error);
					toast.error(t({ message: "Couldn't stop the background task" }));
				}),
		[stopBackgroundTask, t],
	);
	const subagent = useSubagentTarget({
		client,
		items: session.snapshot.items,
		focusedId: focusedSubagentId,
		draftKey,
		onSend,
		onStop: onStopTask,
		onUnsent: restoreUnsent,
	});
	openDraftKey.current = subagent.draftKey;

	const onBackgroundSubagent = useMoveToBackground(client);
	const plugins = usePluginMentionOptions();
	const childrenByParent = useChildrenByParent(session.snapshot);
	const nestedItems = useMemo(
		() => ({
			snapshot: session.snapshot,
			childrenByParent,
			requestItemBodies: session.requestItemBodies,
			respondToApproval: onRespond,
			openSubagent,
			moveToBackground: onBackgroundSubagent,
		}),
		[
			session.snapshot,
			childrenByParent,
			session.requestItemBodies,
			onRespond,
			openSubagent,
			onBackgroundSubagent,
		],
	);
	const backgroundTasks = sessionState?.backgroundTasks ?? NO_TASKS;
	const awaitingBackground = sessionState?.awaitingBackground === true;
	const onCancelTurn = useMemo(
		() =>
			loaded && runningTurnId && !awaitingBackground && !held
				? () => void cancelTurn(runningTurnId, { pauseQueue: true })
				: null,
		[loaded, runningTurnId, awaitingBackground, cancelTurn, held],
	);
	const promptQueue = useMemo(
		() => ({
			prompts: queuedPrompts,
			paused: sessionState?.queuePaused === true,
			actionable: sessionState?.queueControls === true,
			remove: session.removeQueuedPrompt,
			resume: session.resumeQueue,
			steer: session.steerQueuedPrompt,
		}),
		[
			queuedPrompts,
			sessionState?.queuePaused,
			sessionState?.queueControls,
			session.removeQueuedPrompt,
			session.resumeQueue,
			session.steerQueuedPrompt,
		],
	);

	const heldQueued = held?.queued;
	const heldQueue = useMemo(
		() => (heldQueued ? heldPromptQueue(heldQueued) : undefined),
		[heldQueued],
	);
	const booting = sessionState?.status === "starting";
	const composerQueue = heldQueue ?? (held ? undefined : promptQueue);
	const drawerQueue = subagent.target === undefined ? composerQueue : undefined;

	// w-full because the pane lays its children out in a row: without it this
	// sizes to its content and leaves the right of the pane empty.
	return (
		<ChatPaneActionsProvider
			editMessage={editMessage}
			editableMessageIds={editableIds}
			openFile={openFile}
			openPage={openPage}
			openLink={openLink}
			workspaceId={workspaceId}
		>
			<ComposerDropZone
				className="flex h-full min-h-0 w-full min-w-0 flex-col"
				onKeyDown={escapeBack(focusedSubagentId ? goBack : undefined)}
				ref={paneRef}
			>
				{/* Only worth a row when it carries a control: the pane header above
				    already names the agent, and harness/status/connection repeated
				    under it read louder than the transcript. */}
				{headerLeft && (
					<SessionHeader
						connection={session.connection}
						left={headerLeft}
						session={session.snapshot.session}
					/>
				)}
				<MessageScroller.Provider
					autoScroll
					defaultScrollPosition="end"
					scrollEdgeThreshold={RESUME_FOLLOW_PX}
					scrollPreviousItemPeek={0}
				>
					<div className="@container relative flex min-h-0 flex-1">
						<TranscriptPluginsProvider value={plugins}>
							<NestedItemsProvider value={nestedItems}>
								{focusedSubagentId ? (
									<SubagentView
										itemId={focusedSubagentId}
										queued={subagent.queued}
									/>
								) : (
									<Transcript
										approvals={approvals}
										canForkToWorktree={canForkToWorktree}
										groups={timeline}
										hasOlder={session.hasOlder}
										isActive={isActive}
										onCloseFind={focusComposer}
										onDiscardPrompt={session.discardPrompt}
										onFork={onFork ? forkWithTranscript : undefined}
										onLoadOlder={loadOlder}
										onRequestItemBodies={session.requestItemBodies}
										onRespond={onRespond}
										onMessageRevealed={clearRevealMessage}
										onRetryPrompt={session.retryPrompt}
										outbox={session.outbox}
										revealMessageId={revealMessageId}
										sessionId={client.sessionId}
										snapshot={session.snapshot}
									/>
								)}
							</NestedItemsProvider>
						</TranscriptPluginsProvider>
						{!focusedSubagentId && rail.length > 1 && (
							<ChatHistorySidebarScroller
								className="absolute inset-y-0 left-0 my-auto hidden h-fit max-h-full flex-col pl-3 @[56rem]:flex"
								messages={rail}
								onMessageSelect={setRevealMessageId}
							/>
						)}
					</div>
				</MessageScroller.Provider>
				{held ? (
					<ConnectionNotice>{held.notice}</ConnectionNotice>
				) : (
					booting && (
						<ConnectionNotice>
							<Trans>Starting the agent…</Trans>
						</ConnectionNotice>
					)
				)}
				<WorkDrawer
					approvals={approvals}
					onAppendToComposer={appendToComposer}
					onExit={returnToComposer}
					onMoveToBackground={onBackgroundSubagent}
					onOpenSubagent={openSubagent}
					onStop={onStopTask}
					paneRef={paneRef}
					queue={drawerQueue}
					ref={drawerRef}
					snapshot={session.snapshot}
					tasks={backgroundTasks}
				/>
				<Composer
					presetId={presetId}
					agentSwitcher={agentSwitcher}
					availableCommands={sessionState?.availableCommands ?? NO_COMMANDS}
					configOptions={sessionState?.configOptions ?? NO_CONFIG_OPTIONS}
					onSetConfigOption={onSetConfigOption}
					modes={sessionState?.availableModes}
					currentModeId={sessionState?.modeId}
					onSetMode={onSetMode}
					draftKey={subagent.draftKey}
					draftPersisted={subagent.target === undefined}
					inputRef={composerRef}
					history={history}
					isActive={isActive}
					onCancelTurn={onCancelTurn}
					escapeGoesBack={focusedSubagentId !== null}
					onEnterDrawer={enterDrawer}
					onSend={subagent.onSend}
					target={subagent.target}
					canQueue={composerQueue !== undefined}
					onOpenHistory={onOpenHistory}
					workspaceId={workspaceId}
				/>
			</ComposerDropZone>
		</ChatPaneActionsProvider>
	);
}
