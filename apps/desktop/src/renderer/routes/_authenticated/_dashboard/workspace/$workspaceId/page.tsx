import { Workspace } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";
import {
	useMaybeWorkspaceClient,
	workspaceTrpc,
} from "@superset/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openQuickOpen } from "renderer/commandPalette";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { useBareContentCard } from "renderer/routes/_authenticated/_dashboard/components/ContentCard";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { RoundedClip } from "renderer/routes/_authenticated/_dashboard/components/RoundedClip";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { WindowChrome } from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import {
	titleBarTabBarProps,
	useTitleBarMainSlot,
} from "renderer/routes/_authenticated/_dashboard/providers/TitleBarSlotsProvider";
import {
	parseSubagentSearch,
	readSubagentSearch,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { getNotificationSourcesForTab } from "renderer/stores/notifications";
import { useRightPaneAreaEnabled } from "renderer/stores/right-pane-area";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { useStore } from "zustand";
import { usePendingCloudLaunchPane } from "../hooks/usePendingCloudLaunchPane";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { AddTabMenu } from "./components/AddTabMenu";
import { ChangesControl } from "./components/ChangesControl";
import { CloudWorkspaceTabBarControls } from "./components/CloudWorkspaceTabBarControls";
import { HostConnectionPill } from "./components/HostConnectionPill";
import { NotificationStatusIndicator } from "./components/NotificationStatusIndicator";
import { PresetsBar } from "./components/PresetsBar";
import { RightPaneArea } from "./components/RightPaneArea";
import { MIN_RIGHT_PANE_AREA_WIDTH } from "./components/RightPaneArea/constants";
import {
	createRightPane,
	getRightPaneOptions,
	type RightPaneKind,
} from "./components/RightPaneNewTab";
import {
	ActivityPanelAside,
	WorkspaceActivityMenu,
} from "./components/WorkspaceActivityMenu";
import { WorkspaceAgentEffects } from "./components/WorkspaceAgentEffects";
import { WorkspaceEmptyState } from "./components/WorkspaceEmptyState";
import { WorkspaceMissingWorktreeState } from "./components/WorkspaceMissingWorktreeState";
import { WorkspaceMoveBanner } from "./components/WorkspaceMoveBanner";
import { WorkspaceOpenInButton } from "./components/WorkspaceOpenInButton";
import { WorkspaceRunButton } from "./components/WorkspaceRunButton";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import {
	type PaneArea,
	WorkspaceSplitLayout,
} from "./components/WorkspaceSplitLayout";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import { useAgentSessionLauncher } from "./hooks/useAgentSessionLauncher";
import { useAutoAdoptBackgroundSessions } from "./hooks/useAutoAdoptBackgroundSessions";
import { useCloseRightPaneAreaWhenEmpty } from "./hooks/useCloseRightPaneAreaWhenEmpty";
import { useConsumeAutomationRunLink } from "./hooks/useConsumeAutomationRunLink";
import { useConsumeOpenUrlRequest } from "./hooks/useConsumeOpenUrlRequest";
import { useConsumeSubagentLink } from "./hooks/useConsumeSubagentLink";
import { useCreatePendingMigratedTerminals } from "./hooks/useCreatePendingMigratedTerminals";
import { useDefaultBrowserUrl } from "./hooks/useDefaultBrowserUrl";
import { useDefaultContextMenuActions } from "./hooks/useDefaultContextMenuActions";
import { useDefaultPaneActions } from "./hooks/useDefaultPaneActions";
import { useDiffPaneTarget } from "./hooks/useDiffPaneTarget";
import { useHostPendingCloudLaunch } from "./hooks/useHostPendingCloudLaunch";
import { useOpenNewTabWhenRightPaneOpensEmpty } from "./hooks/useOpenNewTabWhenRightPaneOpensEmpty";
import { usePaneAreaMoveActions } from "./hooks/usePaneAreaMoveActions";
import { usePaneRegistry } from "./hooks/usePaneRegistry";
import { renderBrowserTabIcon } from "./hooks/usePaneRegistry/components/BrowserPane";
import { browserRuntimeRegistry } from "./hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { usePresetExecution } from "./hooks/usePresetExecution";
import { usePullRequestPaneIntentOpener } from "./hooks/usePullRequestPaneIntentOpener";
import { useRestoreExpandedPaneArea } from "./hooks/useRestoreExpandedPaneArea";
import { useRightSidebarHotkeys } from "./hooks/useRightSidebarHotkeys";
import { useRunPendingChatHandoff } from "./hooks/useRunPendingChatHandoff";
import { useRunWorkspaceCreationPresets } from "./hooks/useRunWorkspaceCreationPresets";
import { useShellInteractionPassthrough } from "./hooks/useShellInteractionPassthrough";
import { useSyncChatSessionTabs } from "./hooks/useSyncChatSessionTabs";
import { useTabCloseGuard } from "./hooks/useTabCloseGuard";
import { useTerminalLauncher } from "./hooks/useTerminalLauncher";
import { useWorkspaceFileNavigation } from "./hooks/useWorkspaceFileNavigation";
import { useWorkspaceHotkeys } from "./hooks/useWorkspaceHotkeys";
import { useWorkspaceOpenInHotkey } from "./hooks/useWorkspaceOpenInHotkey";
import { useWorkspacePaneLayout } from "./hooks/useWorkspacePaneLayout";
import { useWorkspacePaneOpeners } from "./hooks/useWorkspacePaneOpeners";
import { useWorkspaceRightPane } from "./hooks/useWorkspaceRightPane";
import { useWorkspaceRun } from "./hooks/useWorkspaceRun";
import { RightPaneLinkTargetProvider } from "./providers/RightPaneLinkTargetProvider";
import { WorkspaceGitStatusProvider } from "./providers/WorkspaceGitStatusProvider";
import { FileDocumentStoreProvider } from "./state/fileDocumentStore";
import type {
	ConsumeSearch,
	PaneTarget,
	PaneViewerData,
	SubagentPaneData,
} from "./types";
import { isWorktreeMissing } from "./utils/isWorktreeMissing";
import {
	closeVisibleChangesPane,
	findVisibleChangesPane,
	openChangesPaneInStore,
} from "./utils/openChangesPaneInStore";
import { findVisiblePullRequestNumber } from "./utils/openPullRequestPaneInStore";
import { openSubagentPaneInStore } from "./utils/openSubagentPaneInStore";
import type { WorkspaceUrlOpenTarget } from "./utils/openUrlInWorkspace";

const QUICK_OPEN_SEARCH_LIMIT = 50;

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
	openUrlTarget?: WorkspaceUrlOpenTarget;
	openUrlRequestId?: string;
}

function parseOpenUrlTarget(
	value: unknown,
): WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/workspace/$workspaceId/",
)({
	component: WorkspacePage,
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

function WorkspacePage() {
	const { workspace } = useWorkspace();
	const pendingCloudLaunch = usePendingCloudLaunchPane(workspace.id);
	const workspaceStatusQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspace.id },
		{
			enabled: !pendingCloudLaunch,
			staleTime: 0,
			refetchOnWindowFocus: true,
		},
	);

	if (isWorktreeMissing(workspaceStatusQuery, !!pendingCloudLaunch)) {
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

	return <WorkspaceContent />;
}

function WorkspaceContent() {
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
	const titleBarMainSlot = useTitleBarMainSlot();
	const isParadevShell = useParadevShell();
	useBareContentCard();
	const isWorkspaceSidebarCollapsed = useWorkspaceSidebarStore((s) =>
		s.isCollapsed(),
	);
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
		preferences: userPreferences,
		setRightSidebarWidth,
		setRightPaneAreaWidth,
		setShowPresetsBar,
	} = useUserPreferences();
	const showPresetsBar = userPreferences.showPresetsBar;
	const { store, isLayoutReady } = useWorkspacePaneLayout();
	const isRightPaneAreaEnabled = useRightPaneAreaEnabled();
	const {
		isOpen: sidebarOpen,
		setOpen: setRightSidebarOpen,
		closeEmpty: closeEmptyRightSidebar,
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
		useWorkspacePaneLayout({ slot: "rightPaneLayout" });
	useRestoreExpandedPaneArea({
		workspaceId,
		centerStore: store,
		rightStore,
		isReady: isLayoutReady && isRightLayoutReady,
	});
	const openRightSidebar = useCallback(
		() => setRightSidebarOpen(true),
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
		close: closeEmptyRightSidebar,
	});
	useOpenNewTabWhenRightPaneOpensEmpty({
		store: rightStore,
		isOpen: sidebarOpen,
		enabled: isRightPaneAreaEnabled && isRightLayoutReady,
	});
	const launcher = useTerminalLauncher();
	const {
		createNewAgentSession,
		openAgentChat,
		openNewChat,
		focusAgentTerminal,
	} = useAgentSessionLauncher({ workspaceId, store });
	const addChatTab = useCallback(() => {
		void openNewChat();
	}, [openNewChat]);
	const {
		matchedPresets,
		newTabPresets,
		executePreset,
		resolvePresetCommands,
	} = usePresetExecution({
		store,
		launcher,
		openAgentChat,
	});
	const workspaceRun = useWorkspaceRun({
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
	const { canShowEmptyLayout } = useHostPendingCloudLaunch({
		workspaceId,
		store,
		linkedStores: linkedPaneStores,
		isLayoutReady: isLayoutReady && isRightLayoutReady,
	});
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
	useSyncChatSessionTabs({
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
		openPinnedFilePane,
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
	const registerQuickOpen = useQuickOpenStore((s) => s.register);
	const unregisterQuickOpen = useQuickOpenStore((s) => s.unregister);
	const handleQuickOpen = useCallback(() => openQuickOpen(), []);
	// Picking a file from Quick Open should surface the sidebar/Files tab so
	// the reveal (expand + highlight + scroll) is actually visible.
	const handleQuickOpenSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			const shouldOpenInNewTab =
				openInNewTab ?? userPreferences.sidebarFileLinks.plain === "newTab";
			if (!isRightPaneAreaEnabled) {
				setRightSidebarOpen(true);
				openFilePaneFromTreeClick(filePath, shouldOpenInNewTab);
				return;
			}
			if (shouldOpenInNewTab) openFilePaneFromTreeClick(filePath, true);
			else openPinnedFilePane(filePath);
		},
		[
			userPreferences.sidebarFileLinks.plain,
			openFilePaneFromTreeClick,
			openPinnedFilePane,
			setRightSidebarOpen,
			isRightPaneAreaEnabled,
		],
	);
	// The palette's files frame searches whichever workspace page is open,
	// through this page's client: the palette mounts above the provider.
	const workspaceClient = useMaybeWorkspaceClient();
	const searchFiles = useCallback(
		async (query: string) => {
			if (!workspaceClient) return [];
			const { matches } =
				await workspaceClient.trpcClient.filesystem.searchFiles.query({
					workspaceId,
					query,
					limit: QUICK_OPEN_SEARCH_LIMIT,
				});
			return matches;
		},
		[workspaceClient, workspaceId],
	);
	const canSearchFiles = workspaceClient !== null;
	useEffect(() => {
		registerQuickOpen({
			workspaceId,
			recentFiles,
			openFilePaths,
			canSearch: canSearchFiles,
			searchFiles,
			onSelectFile: handleQuickOpenSelectFile,
		});
		return () => unregisterQuickOpen(workspaceId);
	}, [
		registerQuickOpen,
		unregisterQuickOpen,
		canSearchFiles,
		workspaceId,
		recentFiles,
		openFilePaths,
		searchFiles,
		handleQuickOpenSelectFile,
	]);
	const paneRegistry = usePaneRegistry({
		onOpenDiff: openDiffPane,
		onOpenFile: openFilePaneFromTreeClick,
		onRevealPath: revealPath,
		launcher,
		store,
		linkedStores: linkedPaneStores,
		onOpenSubagent: openSubagentPane,
		onSearch: handleQuickOpen,
		rightStore: isRightPaneAreaEnabled ? rightStore : undefined,
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
	const viewingPullRequestNumber = useStore(
		store,
		findVisiblePullRequestNumber,
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
	const browserUrl = useDefaultBrowserUrl();
	const rightPaneOptions = useMemo(
		() =>
			isRightPaneAreaEnabled
				? getRightPaneOptions({
						sandbox: isSandbox,
						mobilePane: isMobilePaneEnabled,
					}).filter((option) => option.kind !== "terminal")
				: [],
		[isRightPaneAreaEnabled, isSandbox, isMobilePaneEnabled],
	);
	const openInRightPane = useCallback(
		(kind: RightPaneKind) => {
			if (kind === "diff") {
				openChanges();
				return;
			}
			rightStore.getState().addTab({
				panes: [
					createRightPane(kind, { mintTerminalId: launcher.mint, browserUrl }),
				],
			});
			openRightSidebar();
		},
		[openChanges, rightStore, launcher, browserUrl, openRightSidebar],
	);
	useRunPendingChatHandoff({
		workspaceId,
		isLayoutReady,
		createNewAgentSession,
	});

	const defaultPaneActions = useDefaultPaneActions({ launcher });
	const onBeforeCloseTab = useTabCloseGuard(store);
	const onBeforeCloseRightTab = useTabCloseGuard(rightStore);
	const activeAreaRef = useRef<PaneArea>("center");
	const [focusedArea, setFocusedArea] = useState<PaneArea>("center");
	const isRightAreaFocused =
		isRightPaneAreaEnabled && sidebarOpen && focusedArea === "right";
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
	useWorkspaceOpenInHotkey(workspaceId);
	useRightSidebarHotkeys({
		centerStore: store,
		rightStore,
		enabled: isRightPaneAreaEnabled,
		isOpen: sidebarOpen,
		isExpanded: rightPaneMode === "expanded",
		open: openRightSidebar,
		activeAreaRef,
	});
	useHotkey("QUICK_OPEN", handleQuickOpen);
	useHotkey("NEW_CHAT", addChatTab);
	useHotkey("RUN_WORKSPACE_COMMAND", () => {
		void workspaceRun.toggleWorkspaceRun();
	});

	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so window controls don't flash in.
	const isMac = platform === undefined || platform === "darwin";

	const workspaceRunButton = (
		<WorkspaceRunButton
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
			onOpenPullRequest={openPullRequestPane}
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
			isFocused={isRightAreaFocused}
		/>
	);

	return (
		<FileDocumentStoreProvider stores={fileDocumentStores}>
			<WorkspaceAgentEffects store={store} rightStore={rightStore} />
			<RightPaneLinkTargetProvider value={rightPaneLinkTarget}>
				<WorkspaceGitStatusProvider workspaceId={workspaceId}>
					<WorkspaceSplitLayout
						mode={rightPaneMode}
						activeAreaRef={activeAreaRef}
						onActiveAreaChange={setFocusedArea}
						{...(isRightPaneAreaEnabled
							? {
									width: userPreferences.rightPaneAreaWidth,
									minWidth: MIN_RIGHT_PANE_AREA_WIDTH,
									maxWidth: Number.POSITIVE_INFINITY,
									defaultWidth: defaultRightPaneAreaWidth,
									onWidthChange: setRightPaneAreaWidth,
								}
							: {
									width: userPreferences.rightSidebarWidth,
									minWidth: 240,
									maxWidth: 640,
									defaultWidth: defaultRightSidebarWidth,
									onWidthChange: setRightSidebarWidth,
								})}
						onResizingChange={onSidebarResizeDragging}
						onLayoutFrame={relayoutBrowserPanes}
						keepMounted={isRightPaneAreaEnabled}
						sidePanelClassName={
							isParadevShell ? "border-l-0 pl-1.5" : undefined
						}
						side={
							isRightPaneAreaEnabled ? (
								<>
									{rightPaneArea}
									{rightPaneMode === "expanded" && <HostConnectionPill />}
								</>
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
							className={cn(
								"relative flex min-h-0 min-w-0 flex-1",
								isParadevShell &&
									"rounded-r-[10px] border border-border bg-background",
								isParadevShell &&
									isWorkspaceSidebarCollapsed &&
									"rounded-l-[10px]",
							)}
							data-workspace-id={workspaceId}
							data-pane-area="center"
						>
							<RoundedClip
								squareLeft={isParadevShell && !isWorkspaceSidebarCollapsed}
								radiusClassName={isParadevShell ? "rounded-[9px]" : ""}
								className="flex-col"
							>
								{rightPaneMode !== "expanded" && <HostConnectionPill />}
								<WorkspaceMoveBanner workspaceId={workspaceId} />
								{
									<Workspace<PaneViewerData>
										key={workspaceId}
										{...titleBarTabBarProps(titleBarMainSlot, {
											paneArea: "center",
											inert: rightPaneMode === "expanded",
										})}
										appearance={isParadevShell ? "cards" : "default"}
										flush={isParadevShell}
										isFocused={!isRightAreaFocused}
										registry={paneRegistry}
										paneActions={defaultPaneActions}
										contextMenuActions={centerContextMenuActions}
										onPaneError={reportRendererError}
										renderTabIcon={renderBrowserTabIcon}
										renderTabAccessory={(tab) => (
											<NotificationStatusIndicator
												sources={getNotificationSourcesForTab(tab)}
											/>
										)}
										renderBelowTabBar={() =>
											showPresetsBar ? (
												<PresetsBar
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
												onAddChat={addChatTab}
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
												rightPaneOptions={rightPaneOptions}
												onOpenInRightPane={openInRightPane}
												showPresetsBar={showPresetsBar}
												onToggleShowPresetsBar={setShowPresetsBar}
											/>
										)}
										renderPaneAside={() => (
											<ActivityPanelAside workspaceId={workspaceId} />
										)}
										renderTabBarLeading={() => <WindowChrome />}
										renderTabBarTrailing={() => (
											<div
												className={cn(
													"flex items-center gap-1",
													isRightPaneAreaEnabled && "pr-1",
												)}
											>
												<CloudWorkspaceTabBarControls
													workspaceId={workspaceId}
												/>
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
																viewingPullRequestNumber={
																	viewingPullRequestNumber
																}
															/>
														)}
														{/* Open-in must not depend on the right sidebar being open,
											    so it lives here rather than in the sidebar's top strip
											    (#7167). Without an @container ancestor its branch label
											    stays hidden, which keeps it compact for the tab bar. */}
														<WorkspaceOpenInButton workspaceId={workspaceId} />
														<RightSidebarToggle
															isOpen={sidebarOpen}
															onToggle={toggleRightSidebar}
														/>
														{!isMac && !sidebarOpen && <WindowControlsInset />}
													</>
												)}
											</div>
										)}
										renderEmptyState={() =>
											canShowEmptyLayout ? (
												<WorkspaceEmptyState
													onOpenBrowser={addBrowserTab}
													onOpenChanges={openChanges}
													onOpenChat={addChatTab}
													onOpenQuickOpen={handleQuickOpen}
													onOpenTerminal={addTerminalTab}
												/>
											) : (
												// Not null: Workspace shows "No tabs open" for null.
												<div aria-hidden />
											)
										}
										onBeforeCloseTab={onBeforeCloseTab}
										onInteractionStateChange={onWorkspaceInteractionStateChange}
										store={store}
									/>
								}
							</RoundedClip>
						</div>
					</WorkspaceSplitLayout>
				</WorkspaceGitStatusProvider>
			</RightPaneLinkTargetProvider>
		</FileDocumentStoreProvider>
	);
}
