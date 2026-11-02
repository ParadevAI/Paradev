import { Trans, useLingui } from "@lingui/react/macro";
import type { SessionClient } from "@superset/chat/client";
import {
	deriveQueuedPrompts,
	runningTurnId as findRunningTurnId,
	latestSessionUsage,
	launchConfigSelections,
	type OutboxEntry,
	presetForAnyHarness,
	userMessageText,
} from "@superset/chat/core";
import type {
	AvailableCommand,
	Decision,
	SessionConfigOption,
	SessionState,
	UserContent,
	UserMessage,
} from "@superset/chat/protocol";
import {
	useApprovals,
	useChatSession,
	useTimeline,
} from "@superset/chat/react";
import { ComposerDropZone } from "@superset/chat-ui/ComposerDropZone";
import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import type { ComposerDraft } from "@superset/chat-ui/PromptInput";
import { ChatHistorySidebarScroller } from "@superset/ui/chat-history-sidebar";
import { toast } from "@superset/ui/sonner";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";
import { useStableList } from "renderer/hooks/useStableList";
import { useChatTurnSnapshotsEnabled } from "renderer/stores/chat-turn-snapshots";
import type { OpenFile } from "../../../../../../types";
import {
	ChatPaneActionsProvider,
	type OpenDiff,
	type OpenLink,
	type OpenPage,
	type TurnChangesSource,
} from "../../providers/ChatPaneActionsProvider";
import { TurnFailureActionsProvider } from "../../providers/TurnFailureActionsProvider";
import type { ChatEditRequest, ChatForkTarget } from "../../types";
import { buildChatHandoffTranscript } from "../../utils/chatHandoffTranscript";
import { heldPromptQueue } from "../../utils/heldPromptQueue";
import { editableMessageIds, rewindTranscript } from "../../utils/messageEdit";
import { modelDisplayName } from "../../utils/modelDisplayName";
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
import { SetupSessionHeader } from "../SetupSessionHeader";
import { SubagentView } from "../SubagentView";
import { Transcript, type TranscriptHandle } from "../Transcript";
import { useChildrenByParent } from "../Transcript/hooks/useChildrenByParent";
import { NestedItemsProvider } from "../Transcript/providers/NestedItemsProvider";
import { TranscriptPluginsProvider } from "../Transcript/providers/TranscriptPluginsProvider";
import {
	type DrawerExit,
	WorkDrawer,
	type WorkDrawerHandle,
} from "../WorkDrawer";
import { LiveChangesPill } from "./components/LiveChangesPill";
import {
	type SwitchAccount,
	type SwitchableAgent,
	UsageLimitNotice,
} from "./components/UsageLimitNotice";
import { useFailureRecovery } from "./hooks/useFailureRecovery";
import { useMainSend } from "./hooks/useMainSend";
import { useMoveToBackground } from "./hooks/useMoveToBackground";
import { usePendingPrompts } from "./hooks/usePendingPrompts";
import { useRestoreUnsentPrompts } from "./hooks/useRestoreUnsentPrompts";
import { useSubagentNavigation } from "./hooks/useSubagentNavigation";
import { useSubagentTarget } from "./hooks/useSubagentTarget";
import { escapeBack } from "./utils/escapeBack";
import { settledToolCalls } from "./utils/settledToolCalls";
import { setupEnvironmentId } from "./utils/setupEnvironmentLink";

const RESUME_FOLLOW_PX = 24;
const NO_COMMANDS: AvailableCommand[] = [];
const NO_CONFIG_OPTIONS: SessionConfigOption[] = [];

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
	onSwitchAccount,
	sessionAccount,
	onEditMessage,
	onRestartAndContinue,
	onStartNewChat,
	onUserPrompt,
	onSessionState,
	openDiff,
	openFile,
	openPage,
	openLink,
	onOpenHistory,
	terminalId,
	onNewChat,
	workspaceId,
}: {
	client: SessionClient;
	chatKey: string;
	presetId?: string;
	draftKey: string;
	workspaceId: string;
	terminalId?: string;
	headerLeft?: ReactNode;
	held?: {
		notice: ReactNode;
		queued: UserContent[][];
		onQueue: (content: UserContent[]) => void;
		/** Already sent, so shown only until the transcript has a user message. */
		launched?: UserContent[];
	};
	isActive?: boolean;
	pendingPrompts: UserContent[][];
	/** Selected by name once the agent lists its models, before the first prompt goes out. */
	preferredModelLabel?: string;
	onPendingPromptsSent: () => void;
	onSessionState?: (session: SessionState | null) => void;
	/** The mode the user picked, so a resumed session can start in it again. */
	onModeChange?: (modeId: string) => void;
	onSwitchAccount?: SwitchAccount;
	sessionAccount?: TerminalAgentBinding["account"];
	/**
	 * Absent when the agent cannot branch its own session. The transcript is
	 * built here because only this view holds the timeline; a branch into
	 * another worktree cannot resume the session and is told it instead.
	 */
	onFork?: ((target: ChatForkTarget, transcript: string) => void) | undefined;
	canForkToWorktree?: boolean;
	onEditMessage?: (request: ChatEditRequest) => void;
	/** Restarts the agent and sends `prompt` once it is back. */
	onRestartAndContinue?: (prompt: string) => Promise<boolean>;
	/** Resolves false when the new chat could not be started. */
	onStartNewChat?: () => Promise<boolean>;
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
	openDiff?: OpenDiff;
	openPage?: OpenPage;
	openLink?: OpenLink;
	/** Opens the pane header's chat history picker, as `/resume` does. */
	onOpenHistory?: () => void;
	onNewChat?: () => void;
}) {
	const { t } = useLingui();
	const snapshotWorktree = useChatTurnSnapshotsEnabled();
	const session = useChatSession({
		client,
		sendEnabled: held === undefined,
		snapshotWorktree,
	});
	const composerRef = useRef<ComposerHandle>(null);
	const drawerRef = useRef<WorkDrawerHandle>(null);
	const transcriptRef = useRef<TranscriptHandle>(null);
	const paneRef = useRef<HTMLDivElement>(null);
	const { outbox, discardPrompt } = session;
	const openDraftKey = useRef(draftKey);
	const restoreDraft = useCallback(
		(draft: ComposerDraft, originKey: string) => {
			if (originKey !== openDraftKey.current) {
				prependToDraft(originKey, [draft], originKey === draftKey);
				return;
			}
			composerRef.current?.restoreDraft(draft);
			composerRef.current?.focus();
		},
		[draftKey],
	);
	const sentDrafts = useRef(new Map<string, ComposerDraft>());
	const draftOf = useCallback(
		(entry: OutboxEntry): ComposerDraft =>
			sentDrafts.current.get(entry.clientId) ?? {
				segments: [{ type: "text", text: contentText(entry.content) }],
				attachments: [],
			},
		[],
	);
	useEffect(() => {
		const failed = outbox.filter((entry) => entry.state === "failed");
		if (failed.length === 0) return;
		for (const entry of failed) {
			discardPrompt(entry.clientId);
			restoreDraft(draftOf(entry), draftKey);
			sentDrafts.current.delete(entry.clientId);
		}
		toast.error(
			t({ message: "Couldn't send your message. It's back in the composer." }),
		);
	}, [outbox, discardPrompt, restoreDraft, draftOf, draftKey, t]);
	useEffect(() => {
		const live = new Set(outbox.map((entry) => entry.clientId));
		for (const clientId of sentDrafts.current.keys()) {
			if (!live.has(clientId)) sentDrafts.current.delete(clientId);
		}
	}, [outbox]);
	useRestoreUnsentPrompts(draftKey, outbox, draftOf);
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

	usePendingPrompts({
		held: held !== undefined,
		onSent: onPendingPromptsSent,
		prompts: pendingPrompts,
		ready: session.status === "ready" && modelSettled,
		sendPrompt: session.sendPrompt,
	});

	const sessionState = session.snapshot.session;
	useEffect(() => {
		onSessionState?.(sessionState ?? null);
	}, [sessionState, onSessionState]);

	const runningTurnId = useMemo(
		() => findRunningTurnId(session.snapshot.turns),
		[session.snapshot.turns],
	);
	const liveRefreshKey = useMemo(
		() =>
			settledToolCalls(
				timeline.find((group) => group.turnId === runningTurnId),
			),
		[timeline, runningTurnId],
	);
	const turnChanges = useMemo<TurnChangesSource>(
		() => ({
			sessionId: client.sessionId,
			load: (turnId, live, anchorItemIds) =>
				client.getTurnChanges({
					workspaceId,
					turnId,
					live,
					...(anchorItemIds?.length ? { anchorItemIds } : {}),
				}),
			undo: (turnId, paths, anchorItemIds) =>
				client.undoTurnFiles({
					workspaceId,
					turnId,
					paths,
					...(anchorItemIds?.length ? { anchorItemIds } : {}),
				}),
		}),
		[client, workspaceId],
	);
	const sessionUsage = useMemo(
		() => latestSessionUsage(session.snapshot.turns),
		[session.snapshot.turns],
	);

	const snapshotItems = session.snapshot.items;
	const setupEnvironment = useMemo(() => {
		for (const { item } of snapshotItems.values()) {
			if (item.kind === "user_message") {
				return setupEnvironmentId(
					userMessageText(item as UserMessage),
					env.NEXT_PUBLIC_WEB_URL,
				);
			}
		}
		return null;
	}, [snapshotItems]);
	const queuedPrompts = useStableList(
		useMemo(
			() => deriveQueuedPrompts({ items: snapshotItems }),
			[snapshotItems],
		),
	);

	const focusComposer = useCallback(() => composerRef.current?.focus(), []);
	const openFind = useCallback(() => transcriptRef.current?.openFind(), []);
	const [revealMessageId, setRevealMessageId] = useState<string | null>(null);
	const clearRevealMessage = useCallback(() => setRevealMessageId(null), []);
	const returnToComposer = useCallback(
		(exit: DrawerExit) => composerRef.current?.returnFocus(exit === "history"),
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
		(draft: ComposerDraft) => {
			restoreDraft(draft, draftKey);
			toast.error(
				t({
					message: "Couldn't send your message. It's back in the composer.",
				}),
			);
		},
		[restoreDraft, draftKey, t],
	);
	const sendKeepingDraft = useCallback(
		(
			content: UserContent[],
			options: { expectedTurnId: string } | undefined,
			draft: ComposerDraft,
		) => {
			const entry = sendPrompt(content, options);
			sentDrafts.current.set(entry.clientId, draft);
			return entry;
		},
		[sendPrompt],
	);
	const onSend = useMainSend({
		approvals,
		holdPrompt,
		loaded,
		onAnswerFailed,
		onUserPrompt,
		respondToApproval,
		runningTurnId,
		sendPrompt: sendKeepingDraft,
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
			restoreDraft(
				{
					segments: [{ type: "text", text: contentText(content) }],
					attachments: [],
				},
				originKey,
			),
		[restoreDraft],
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
			pausedByLimit:
				sessionState?.usageLimit !== undefined ||
				sessionState?.queuePausedByLimit === true,
			actionable: sessionState?.queueControls === true,
			remove: session.removeQueuedPrompt,
			resume: session.resumeQueue,
			steer: session.steerQueuedPrompt,
			update: session.updateQueuedPrompt,
		}),
		[
			queuedPrompts,
			sessionState?.queuePaused,
			sessionState?.usageLimit,
			sessionState?.queuePausedByLimit,
			sessionState?.queueControls,
			session.removeQueuedPrompt,
			session.resumeQueue,
			session.steerQueuedPrompt,
			session.updateQueuedPrompt,
		],
	);

	const limit = sessionState?.usageLimit;
	const respondToUsageLimit = session.respondToUsageLimit;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const usageLimit = useMemo(() => {
		if (!limit) return undefined;
		const preset = harness ? presetForAnyHarness(harness) : undefined;
		const agent: SwitchableAgent | undefined =
			preset === "claude" ? "claude" : preset === "codex" ? "codex" : undefined;
		return {
			limit,
			respond: respondToUsageLimit,
			modelLabel: limit.model
				? modelDisplayName(limit.model, configOptions ?? [])
				: undefined,
			agent,
			hostUrl,
			sessionAccount,
			onSwitchAccount,
		};
	}, [
		limit,
		respondToUsageLimit,
		harness,
		configOptions,
		hostUrl,
		onSwitchAccount,
		sessionAccount,
	]);

	const heldQueued = held?.queued;
	const heldLaunched = held?.launched;
	const heldQueue = useMemo(
		() =>
			heldQueued
				? heldPromptQueue(heldQueued, {
						launched: heldLaunched,
						items: snapshotItems,
					})
				: undefined,
		[heldQueued, heldLaunched, snapshotItems],
	);
	const booting = sessionState?.status === "starting";
	const openModelPicker = useCallback(
		() => composerRef.current?.openModelPicker(),
		[],
	);
	const { failureActions, onSetConfigOption, onModelPickerOpenChange } =
		useFailureRecovery({
			blocked:
				!loaded ||
				booting ||
				held !== undefined ||
				runningTurnId !== null ||
				approvals.length > 0 ||
				outbox.length > 0,
			configOptions,
			onRestartAndContinue,
			onStartNewChat,
			openModelPicker,
			sendPrompt,
			setConfigOption,
		});
	const composerQueue = heldQueue ?? (held ? undefined : promptQueue);
	const drawerQueue = subagent.target === undefined ? composerQueue : undefined;

	// w-full because the pane lays its children out in a row: without it this
	// sizes to its content and leaves the right of the pane empty.
	return (
		<ChatPaneActionsProvider
			editMessage={editMessage}
			editableMessageIds={editableIds}
			openDiff={openDiff}
			turnChanges={turnChanges}
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
				{setupEnvironment && (
					<SetupSessionHeader environmentId={setupEnvironment} />
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
									<TurnFailureActionsProvider value={failureActions}>
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
											ref={transcriptRef}
											revealMessageId={revealMessageId}
											sessionId={client.sessionId}
											snapshot={session.snapshot}
										/>
									</TurnFailureActionsProvider>
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
				{runningTurnId && !focusedSubagentId && (
					<LiveChangesPill refreshKey={liveRefreshKey} turnId={runningTurnId} />
				)}
				<WorkDrawer
					notice={
						usageLimit &&
						!held && (
							<UsageLimitNotice
								agent={usageLimit.agent}
								hostUrl={usageLimit.hostUrl}
								limit={usageLimit.limit}
								modelLabel={usageLimit.modelLabel}
								onRespond={usageLimit.respond}
								onSwitchAccount={usageLimit.onSwitchAccount}
								sessionAccount={usageLimit.sessionAccount}
							/>
						)
					}
					onExit={returnToComposer}
					paneRef={paneRef}
					queue={drawerQueue}
					ref={drawerRef}
				/>
				<Composer
					presetId={presetId}
					sessionId={client.sessionId}
					agentSwitcher={agentSwitcher}
					availableCommands={sessionState?.availableCommands ?? NO_COMMANDS}
					configOptions={sessionState?.configOptions ?? NO_CONFIG_OPTIONS}
					onSetConfigOption={onSetConfigOption}
					onModelPickerOpenChange={onModelPickerOpenChange}
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
					onOpenHistory={onOpenHistory}
					sessionUsage={sessionUsage}
					turnRunning={runningTurnId !== null}
					terminalId={terminalId}
					agentLabel={agentLabel}
					onNewChat={onNewChat}
					onFork={onFork ? forkWithTranscript : undefined}
					canForkToWorktree={canForkToWorktree}
					onOpenFind={focusedSubagentId ? undefined : openFind}
					usageLimited={!held && usageLimit !== undefined}
					workspaceId={workspaceId}
				/>
			</ComposerDropZone>
		</ChatPaneActionsProvider>
	);
}
