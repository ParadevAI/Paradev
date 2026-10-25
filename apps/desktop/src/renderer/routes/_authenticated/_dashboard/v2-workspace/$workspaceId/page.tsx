import { Workspace } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useMemo, useRef } from "react";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { WindowChrome } from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import {
	parseSubagentSearch,
	readSubagentSearch,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { CommandPalette } from "renderer/screens/main/components/CommandPalette";
import { useRightPaneAreaEnabled } from "renderer/stores/right-pane-area";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import { useStore } from "zustand";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { AddTabMenu } from "./components/AddTabMenu";
import { ChangesControl } from "./components/ChangesControl";
import { CloudWorkspaceTabBarControls } from "./components/CloudWorkspaceTabBarControls";
import { RightPaneArea, type RightPaneKind } from "./components/RightPaneArea";
import { MIN_RIGHT_PANE_AREA_WIDTH } from "./components/RightPaneArea/constants";
import { V2NotificationStatusIndicator } from "./components/V2NotificationStatusIndicator";
import { V2PresetsBar } from "./components/V2PresetsBar";
import { V2WorkspaceOpenInButton } from "./components/V2WorkspaceOpenInButton";
import { V2WorkspaceRunButton } from "./components/V2WorkspaceRunButton";
import { WorkspaceActivityMenu } from "./components/WorkspaceActivityMenu";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceMissingWorktreeState } from "./components/WorkspaceMissingWorktreeState";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import {
	type PaneArea,
	WorkspaceSplitLayout,
} from "./components/WorkspaceSplitLayout";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import { useAgentSessionLauncher } from "./hooks/useAgentSessionLauncher";
import { useAutoAdoptBackgroundSessions } from "./hooks/useAutoAdoptBackgroundSessions";
import { useAutoAdoptChatSessions } from "./hooks/useAutoAdoptChatSessions";
import { useClearActivePaneAttention } from "./hooks/useClearActivePaneAttention";
import { useCloseRightPaneAreaWhenEmpty } from "./hooks/useCloseRightPaneAreaWhenEmpty";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useConsumeSubagentLink } from "./hooks/useConsumeSubagentLink";
import { useCreatePendingMigratedTerminals } from "./hooks/useCreatePendingMigratedTerminals";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "./hooks/useDefaultPaneActions";
import { useDiffPaneTarget } from "./hooks/useDiffPaneTarget";
import { useIsChatTabActive } from "./hooks/useIsChatTabActive";
import { usePaneAreaMoveActions } from "./hooks/usePaneAreaMoveActions";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { browserRuntimeRegistry } from "./hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { usePullRequestPaneIntentOpener } from "./hooks/usePullRequestPaneIntentOpener";
import { useRestoreExpandedPaneArea } from "./hooks/useRestoreExpandedPaneArea";
import { useRightPaneAreaLifecycle } from "./hooks/useRightPaneAreaLifecycle";
import { useRunPendingChatHandoff } from "./hooks/useRunPendingChatHandoff";
import { useRunWorkspaceCreationPresets } from "./hooks/useRunWorkspaceCreationPresets";
import { useShellInteractionPassthrough } from "./hooks/useShellInteractionPassthrough";
import { useTabCloseGuard } from "./hooks/useTabCloseGuard";
import { useV2PresetExecution } from "./hooks/useV2PresetExecution";
import { useV2TerminalLauncher } from "./hooks/useV2TerminalLauncher";
import { useV2WorkspacePaneLayout } from "./hooks/useV2WorkspacePaneLayout";
import { useV2WorkspaceRun } from "./hooks/useV2WorkspaceRun";
import { useWorkspaceFileNavigation } from "./hooks/useWorkspaceFileNavigation";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import { useWorkspacePaneOpeners } from "./hooks/useWorkspacePaneOpeners";
import { useWorkspaceRightPane } from "./hooks/useWorkspaceRightPane";
import { RightPaneLinkTargetProvider } from "./providers/RightPaneLinkTargetProvider";
import { WorkspaceGitStatusProvider } from "./providers/WorkspaceGitStatusProvider";
import { FileDocumentStoreProvider } from "./state/fileDocumentStore";
import type {
	ConsumeSearch,
	PaneTarget,
	PaneViewerData,
	SubagentPaneData,
} from "./types";
import {
	closeVisibleChangesPane,
	findVisibleChangesPane,
	openChangesPaneInStore,
} from "./utils/openChangesPaneInStore";
import { openSubagentPaneInStore } from "./utils/openSubagentPaneInStore";
import type { V2WorkspaceUrlOpenTarget } from "./utils/openUrlInV2Workspace";

const relayoutBrowserPanes = () => browserRuntimeRegistry.relayout();

const defaultRightPaneAreaWidth = (containerWidth: number) =>
	Math.round(containerWidth * 0.4);
const defaultRightSidebarWidth = () => 340;

interface WorkspaceSearch {
	sessionId?: string;
	terminalId?: string;
	focusRequestId?: string;
	/** Deep link from the sidebar's agents chip into a subagent transcript. */
	subagentTerminalId?: string;
	subagentId?: string;
	subagentAgentId?: string;
	subagentType?: string;
	openUrl?: string;
	openUrlTarget?: V2WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}

function parseOpenUrlTarget(
	value: unknown,
): V2WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
		sessionId: parseNonEmptyString(raw.sessionId),
		terminalId: parseNonEmptyString(raw.terminalId),
		focusRequestId: parseNonEmptyString(raw.focusRequestId),
		...readSubagentSearch(raw),
		openUrl: parseNonEmptyString(raw.openUrl),
		openUrlTarget: parseOpenUrlTarget(raw.openUrlTarget),
		openUrlRequestId: parseNonEmptyString(raw.openUrlRequestId),
	}),
});

function V2WorkspacePage() {
	const { workspace } = useWorkspace();
	const workspaceStatusQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspace.id },
		{
			refetchOnWindowFocus: true,
		},
	);

	if (workspaceStatusQuery.data?.worktreeExists === false) {
		return (
			<StateScreenShell>
				<WorkspaceMissingWorktreeState
					workspaceId={workspace.id}
					workspaceName={workspace.name}
					branch={workspace.branch}
					worktreePath={workspaceStatusQuery.data?.worktreePath}
					onRefresh={() => {
						void workspaceStatusQuery.refetch();
					}}
					isRefreshing={workspaceStatusQuery.isFetching}
				/>
			</StateScreenShell>
		);
	}

	return <V2WorkspaceContent />;
}

function V2WorkspaceContent() {
	const {
		sessionId,
		terminalId,
		focusRequestId,
		subagentTerminalId,
		subagentId,
		subagentAgentId,
		subagentType,
		openUrl,
		openUrlTarget,
		openUrlRequestId,
	} = Route.useSearch();
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const navigate = Route.useNavigate();
	const consumeSearch = useCallback<ConsumeSearch>(
		(keys) => {
			void navigate({
				search: (prev) => ({
					...prev,
					...Object.fromEntries(keys.map((key) => [key, undefined])),
					focusRequestId: undefined,
				}),
				replace: true,
			});
		},
		[navigate],
	);

	const {
		preferences: v2UserPreferences,
		setRightSidebarWidth,
		setRightPaneAreaWidth,
		setShowPresetsBar,
	} = useV2UserPreferences();
	const showPresetsBar = v2UserPreferences.showPresetsBar;
	const { store, isLayoutReady, hasRow } = useV2WorkspacePaneLayout();
	useClearActivePaneAttention({ store });
	const isChatTabActive = useIsChatTabActive(store);
	const rightPaneAreaFlag = useRightPaneAreaEnabled();
	const isRightPaneAreaEnabled = rightPaneAreaFlag === true;
	const {
		isOpen: sidebarOpen,
		setOpen: setRightSidebarOpen,
		toggle: toggleRightSidebar,
		mode: rightPaneMode,
		toggleFullScreen: toggleRightPaneAreaFullScreen,
	} = useWorkspaceRightPane({
		workspaceId,
		isPaneAreaEnabled: isRightPaneAreaEnabled,
	});
	const isMobilePaneEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.MOBILE_PANE) === true;
	const { store: rightStore, isLayoutReady: isRightLayoutReady } =
		useV2WorkspacePaneLayout({ slot: "rightPaneLayout" });
	useClearActivePaneAttention({ store: rightStore });
	useRestoreExpandedPaneArea({
		workspaceId,
		centerStore: store,
		rightStore,
		isReady: isLayoutReady && isRightLayoutReady,
	});
	useRightPaneAreaLifecycle({
		workspaceId,
		flag: rightPaneAreaFlag,
		centerStore: store,
		rightStore,
		isReady: isLayoutReady && isRightLayoutReady,
		hasRow,
	});
	const openRightSidebar = useCallback(
		() => setRightSidebarOpen(true),
		[setRightSidebarOpen],
	);
	const closeRightSidebar = useCallback(
		() => setRightSidebarOpen(false),
		[setRightSidebarOpen],
	);
	const rightTarget = useMemo<PaneTarget>(
		() => ({ store: rightStore, reveal: openRightSidebar }),
		[rightStore, openRightSidebar],
	);
	const rightPaneLinkTarget = isRightPaneAreaEnabled ? rightTarget : null;
	const viewerTarget = useMemo<PaneTarget>(
		() => rightPaneLinkTarget ?? { store, reveal: () => {} },
		[rightPaneLinkTarget, store],
	);
	const openSubagentPane = useCallback(
		(data: SubagentPaneData) => {
			viewerTarget.reveal();
			openSubagentPaneInStore(viewerTarget.store, data);
		},
		[viewerTarget],
	);
	const linkedPaneStores = useMemo(() => [rightStore], [rightStore]);
	const fileDocumentStores = useMemo(
		() => [store, rightStore],
		[store, rightStore],
	);
	useCloseRightPaneAreaWhenEmpty({
		store: rightStore,
		enabled: isRightPaneAreaEnabled && isRightLayoutReady,
		close: closeRightSidebar,
	});
	const launcher = useV2TerminalLauncher();
	const {
		createNewAgentSession,
		openAgentChat,
		openNewChat,
		focusAgentTerminal,
	} = useAgentSessionLauncher({ workspaceId, store });
	const acpChat = useAcpChatEnabled();
	const addChatTab = useCallback(() => {
		void openNewChat();
	}, [openNewChat]);
	const onAddChat = acpChat === "enabled" ? addChatTab : undefined;
	const {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	} = useV2PresetExecution({
		store,
		launcher,
		openAgentChat,
	});
	const workspaceRun = useV2WorkspaceRun({
		store,
		launcher,
		matchedPresets,
		resolvePresetCommands,
	});
	useConsumeAutomationRunLink({
		store,
		linkedStores: linkedPaneStores,
		isLayoutReady: isLayoutReady && isRightLayoutReady,
		workspaceId,
		sessionId,
		terminalId,
		focusRequestId,
		consumeSearch,
	});
	const subagentLink = useMemo(
		() =>
			parseSubagentSearch({
				subagentTerminalId,
				subagentId,
				subagentAgentId,
				subagentType,
			}),
		[subagentTerminalId, subagentId, subagentAgentId, subagentType],
	);
	useConsumeSubagentLink({
		openSubagentPane,
		isLayoutReady,
		link: subagentLink,
		focusRequestId,
		consumeSearch,
	});
	useCreatePendingMigratedTerminals({ workspaceId, isLayoutReady });
	useRunWorkspaceCreationPresets({
		workspaceId,
		isLayoutReady,
		executePreset,
		resolvePresetCommands,
	});
	useAutoAdoptBackgroundSessions({
		store,
		linkedStores: linkedPaneStores,
		workspaceId,
		isLayoutReady: isLayoutReady && isRightLayoutReady,
	});
	useAutoAdoptChatSessions({
		store,
		linkedStores: linkedPaneStores,
		workspaceId,
		isLayoutReady: isLayoutReady && isRightLayoutReady,
	});
	useConsumeOpenUrlRequest({
		viewer: viewerTarget,
		url: openUrl,
		target: openUrlTarget,
		requestId: openUrlRequestId,
		consumeSearch,
	});

	const {
		openFilePaneFromTreeClick,
		revealPath,
		selectedFilePath,
		pendingReveal,
		recentFiles,
		openFilePaths,
	} = useWorkspaceFileNavigation({
		viewer: viewerTarget,
		setRightSidebarOpen,
	});

	const {
		openDiffPane,
		addTerminalTab,
		addBrowserTab,
		openChangesPane,
		toggleChangesPane,
		openCommentPane,
		openPagePane,
		openPullRequestPane,
	} = useWorkspacePaneOpeners({
		store,
		viewer: viewerTarget,
		launcher,
		newTabPresets,
		executePreset,
		setRightSidebarOpen,
	});
	const quickOpenOpen = useQuickOpenStore(
		(s) => s.open && s.target?.workspaceId === workspaceId,
	);
	const closeQuickOpen = useQuickOpenStore((s) => s.close);
	const openQuickOpenFor = useQuickOpenStore((s) => s.openFor);
	const handleQuickOpen = useCallback(
		() => openQuickOpenFor({ workspaceId }),
		[openQuickOpenFor, workspaceId],
	);
	const handleQuickOpenChange = useCallback(
		(next: boolean) => {
			if (!next) closeQuickOpen();
		},
		[closeQuickOpen],
	);
	// Picking a file from Quick Open should surface the sidebar/Files tab so
	// the reveal (expand + highlight + scroll) is actually visible.
	const handleQuickOpenSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			if (!isRightPaneAreaEnabled) setRightSidebarOpen(true);
			openFilePaneFromTreeClick(filePath, openInNewTab);
		},
		[openFilePaneFromTreeClick, setRightSidebarOpen, isRightPaneAreaEnabled],
	);
	const paneRegistry = usePaneRegistry({
		onOpenDiff: openDiffPane,
		onOpenFile: openFilePaneFromTreeClick,
		onRevealPath: revealPath,
		launcher,
		store,
		linkedStores: linkedPaneStores,
		onOpenSubagent: openSubagentPane,
		onSearch: handleQuickOpen,
	});
	const defaultContextMenuActions = useDefaultContextMenuActions({
		paneRegistry,
		launcher,
		viewer: viewerTarget,
	});
	const diffPaneTarget = useDiffPaneTarget(store);
	const isChangesPaneOpen = useStore(
		store,
		(state) => findVisibleChangesPane(state) != null,
	);
	const isRightChangesTabOpen = useStore(
		rightStore,
		(state) => findVisibleChangesPane(state) != null,
	);
	const openRightChangesTab = useCallback(() => {
		setRightSidebarOpen(true);
		openChangesPaneInStore(rightStore, "tab");
	}, [rightStore, setRightSidebarOpen]);
	const toggleRightChangesTab = useCallback(() => {
		if (sidebarOpen && closeVisibleChangesPane(rightStore)) return;
		openRightChangesTab();
	}, [rightStore, sidebarOpen, openRightChangesTab]);
	const openChanges = isRightPaneAreaEnabled
		? openRightChangesTab
		: openChangesPane;
	const toggleChanges = isRightPaneAreaEnabled
		? toggleRightChangesTab
		: toggleChangesPane;
	const isChangesOpen = isRightPaneAreaEnabled
		? sidebarOpen && isRightChangesTabOpen
		: isChangesPaneOpen;

	usePullRequestPaneIntentOpener({
		workspaceId,
		isLayoutReady,
		openPullRequestPane,
	});
	const hostTarget = useWorkspaceHostTarget(workspaceId);
	const isSandbox =
		hostTarget.status === "ready" && hostTarget.kind === "sandbox";
	const addDesktopTab = useCallback(() => {
		viewerTarget.reveal();
		viewerTarget.store.getState().addTab({
			panes: [{ kind: "desktop", data: { kind: "desktop" } }],
		});
	}, [viewerTarget]);
	useRunPendingChatHandoff({
		workspaceId,
		isLayoutReady,
		createNewAgentSession,
	});

	const defaultPaneActions = useDefaultPaneActions({ launcher });
	const onBeforeCloseTab = useTabCloseGuard(store);
	const onBeforeCloseRightTab = useTabCloseGuard(rightStore);
	const activeAreaRef = useRef<PaneArea>("center");
	const getCloseTarget = useCallback(
		() =>
			isRightPaneAreaEnabled && sidebarOpen && activeAreaRef.current === "right"
				? { store: rightStore, onBeforeCloseTab: onBeforeCloseRightTab }
				: { store, onBeforeCloseTab },
		[
			isRightPaneAreaEnabled,
			sidebarOpen,
			rightStore,
			onBeforeCloseRightTab,
			store,
			onBeforeCloseTab,
		],
	);
	const { openAgentChat: openRightAgentChat } = useAgentSessionLauncher({
		workspaceId,
		store: rightStore,
	});
	const { executePreset: executeRightPreset } = useV2PresetExecution({
		store: rightStore,
		launcher,
		openAgentChat: openRightAgentChat,
	});
	const rightOpeners = useWorkspacePaneOpeners({
		store: rightStore,
		viewer: rightTarget,
		launcher,
		newTabPresets,
		executePreset: executeRightPreset,
		setRightSidebarOpen,
	});
	const addRightPane = useCallback(
		(kind: RightPaneKind) => {
			switch (kind) {
				case "files":
				case "changes-list":
				case "review":
				case "pages-list":
				case "desktop":
				case "mobile":
					rightStore.getState().addTab({ panes: [{ kind, data: { kind } }] });
					return;
				case "diff":
					openChangesPaneInStore(rightStore, "tab");
					return;
				case "browser":
					rightOpeners.addBrowserTab();
					return;
				case "terminal":
					void rightOpeners.addTerminalTab();
					return;
			}
		},
		[rightStore, rightOpeners],
	);
	const centerContextMenuActions = usePaneAreaMoveActions({
		defaults: defaultContextMenuActions,
		enabled: isRightPaneAreaEnabled,
		source: store,
		target: rightStore,
		onMoved: openRightSidebar,
	});

	const { onSidebarResizeDragging, onWorkspaceInteractionStateChange } =
		useShellInteractionPassthrough({ sidebarOpen });

	useWorkspaceHotkeys({
		store,
		viewer: viewerTarget,
		matchedPresets,
		executePreset,
		addTerminalTab,
		openChangesPane: openChanges,
		paneRegistry,
		launcher,
		getCloseTarget,
		isSandbox,
		isMobilePaneEnabled,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);
	useHotkey("NEW_CHAT", addChatTab, { enabled: acpChat !== "disabled" });
	useHotkey("RUN_WORKSPACE_COMMAND", () => {
		void workspaceRun.toggleWorkspaceRun();
	});

	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so window controls don't flash in.
	const isMac = platform === undefined || platform === "darwin";

	const workspaceRunButton = (
		<V2WorkspaceRunButton
			projectId={workspace.projectId}
			definition={workspaceRun.definition}
			isRunning={workspaceRun.isRunning}
			isPending={workspaceRun.isPending}
			canForceStop={workspaceRun.canForceStop}
			onToggle={workspaceRun.toggleWorkspaceRun}
			onForceStop={workspaceRun.forceStopWorkspaceRun}
		/>
	);

	const renderWorkspaceToolbar = (isRightPaneOpen: boolean) => (
		<WorkspaceToolbar
			run={workspaceRun}
			showChanges={isLayoutReady}
			isChangesOpen={isChangesOpen}
			onToggleChanges={toggleChanges}
			onOpenPullRequest={openPullRequestPane}
			isRightPaneOpen={isRightPaneOpen}
			onToggleRightPane={toggleRightSidebar}
			showWindowControls={!isMac}
		/>
	);

	const activityMenu = (
		<WorkspaceActivityMenu
			workspaceId={workspaceId}
			store={store}
			linkedStores={linkedPaneStores}
			isLayoutReady={isLayoutReady && isRightLayoutReady}
			onOpenPage={openPagePane}
			onCreateNewAgentSession={createNewAgentSession}
			onFocusAgentTerminal={focusAgentTerminal}
			changes={
				isRightPaneAreaEnabled
					? { isOpen: isChangesOpen, onToggle: toggleChanges }
					: undefined
			}
		/>
	);

	const rightPaneArea = (
		<RightPaneArea
			key={workspaceId}
			store={rightStore}
			registry={paneRegistry}
			paneActions={defaultPaneActions}
			contextMenuActions={defaultContextMenuActions}
			onBeforeCloseTab={onBeforeCloseRightTab}
			onInteractionStateChange={onWorkspaceInteractionStateChange}
			toolbar={renderWorkspaceToolbar(true)}
			isFullScreen={rightPaneMode === "expanded"}
			onToggleFullScreen={toggleRightPaneAreaFullScreen}
			onAdd={addRightPane}
			gates={{ sandbox: isSandbox, mobilePane: isMobilePaneEnabled }}
		/>
	);

	return (
		<FileDocumentStoreProvider stores={fileDocumentStores}>
			<RightPaneLinkTargetProvider value={rightPaneLinkTarget}>
				<WorkspaceGitStatusProvider workspaceId={workspaceId}>
					<WorkspaceSplitLayout
						mode={rightPaneMode}
						activeAreaRef={activeAreaRef}
						{...(isRightPaneAreaEnabled
							? {
									width: v2UserPreferences.rightPaneAreaWidth,
									minWidth: MIN_RIGHT_PANE_AREA_WIDTH,
									maxWidth: Number.POSITIVE_INFINITY,
									defaultWidth: defaultRightPaneAreaWidth,
									onWidthChange: setRightPaneAreaWidth,
								}
							: {
									width: v2UserPreferences.rightSidebarWidth,
									minWidth: 240,
									maxWidth: 640,
									defaultWidth: defaultRightSidebarWidth,
									onWidthChange: setRightSidebarWidth,
								})}
						onResizingChange={onSidebarResizeDragging}
						onLayoutFrame={relayoutBrowserPanes}
						keepMounted={isRightPaneAreaEnabled}
						side={
							isRightPaneAreaEnabled ? (
								rightPaneArea
							) : (
								<WorkspaceSidebar
									workspaceId={workspaceId}
									runButton={workspaceRunButton}
									onSelectFile={openFilePaneFromTreeClick}
									onSelectDiffFile={openDiffPane}
									onOpenComment={openCommentPane}
									onOpenPullRequest={openPullRequestPane}
									onSearch={handleQuickOpen}
									selectedFilePath={selectedFilePath}
									selectedDiffTarget={diffPaneTarget}
									pendingReveal={pendingReveal}
								/>
							)
						}
					>
						<div
							className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
							data-workspace-id={workspaceId}
							data-pane-area="center"
						>
							{
								<Workspace<PaneViewerData>
									key={workspaceId}
									registry={paneRegistry}
									paneActions={defaultPaneActions}
									contextMenuActions={centerContextMenuActions}
									onPaneError={reportRendererError}
									renderTabIcon={renderBrowserTabIcon}
									renderTabAccessory={(tab) => (
										<V2NotificationStatusIndicator
											sources={getV2NotificationSourcesForTab(tab)}
										/>
									)}
									renderBelowTabBar={() =>
										showPresetsBar && !isChatTabActive ? (
											<V2PresetsBar
												matchedPresets={matchedPresets}
												executePreset={executePreset}
												showPresetsBar={showPresetsBar}
												onToggleShowPresetsBar={setShowPresetsBar}
											/>
										) : null
									}
									renderAddTabMenu={({ runAfterClose }) => (
										<AddTabMenu
											onAddTerminal={addTerminalTab}
											runAfterClose={runAfterClose}
											onAddChat={onAddChat}
											onAddBrowser={
												isRightPaneAreaEnabled ? undefined : addBrowserTab
											}
											onAddChanges={
												isRightPaneAreaEnabled ? undefined : openChanges
											}
											onAddDesktop={
												isSandbox && !isRightPaneAreaEnabled
													? addDesktopTab
													: undefined
											}
											showPresetsBar={showPresetsBar}
											onToggleShowPresetsBar={setShowPresetsBar}
										/>
									)}
									renderTabBarLeading={() => <WindowChrome />}
									renderTabBarTrailing={() => (
										<div
											className={cn(
												"flex items-center gap-1",
												isRightPaneAreaEnabled && "pr-1",
											)}
										>
											<CloudWorkspaceTabBarControls workspaceId={workspaceId} />
											{activityMenu}
											{isRightPaneAreaEnabled ? (
												!sidebarOpen && renderWorkspaceToolbar(false)
											) : (
												<>
													{isLayoutReady && (
														<ChangesControl
															workspaceId={workspaceId}
															isChangesOpen={isChangesOpen}
															onToggleChanges={toggleChanges}
															onOpenPullRequest={openPullRequestPane}
														/>
													)}
													{/* Open-in must not depend on the right sidebar being open,
											    so it lives here rather than in the sidebar's top strip
											    (#7167). Without an @container ancestor its branch label
											    stays hidden, which keeps it compact for the tab bar. */}
													<V2WorkspaceOpenInButton workspaceId={workspaceId} />
													<RightSidebarToggle
														isOpen={sidebarOpen}
														onToggle={toggleRightSidebar}
													/>
													{!isMac && !sidebarOpen && <WindowControlsInset />}
												</>
											)}
										</div>
									)}
									renderEmptyState={() => (
										<WorkspaceEmptyState
											onOpenBrowser={addBrowserTab}
											onOpenChanges={openChanges}
											onOpenChat={onAddChat}
											onOpenQuickOpen={handleQuickOpen}
											onOpenTerminal={addTerminalTab}
										/>
									)}
									onBeforeCloseTab={onBeforeCloseTab}
									onInteractionStateChange={onWorkspaceInteractionStateChange}
									store={store}
								/>
							}
						</div>
					</WorkspaceSplitLayout>
				</WorkspaceGitStatusProvider>
			</RightPaneLinkTargetProvider>
			<CommandPalette
				workspaceId={workspaceId}
				open={quickOpenOpen}
				onOpenChange={handleQuickOpenChange}
				onSelectFile={handleQuickOpenSelectFile}
				variant="v2"
				recentlyViewedFiles={recentFiles}
				openFilePaths={openFilePaths}
			/>
		</FileDocumentStoreProvider>
	);
}
