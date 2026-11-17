import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { CommandPaletteHost } from "renderer/commandPalette";
import { useWorkspaceNamingFailedToast } from "renderer/hooks/host-service/useWorkspaceNamingFailedToast";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { useQuickCreateWorkspace } from "renderer/hooks/useQuickCreateWorkspace";
import { useHotkey } from "renderer/hotkeys";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar";
import { DashboardSidebarPortsProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { PortForwardsProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { WorkspaceSidebarPanel } from "renderer/routes/_authenticated/_dashboard/components/WorkspaceSidebarPanel";
import { useHistoryNavigationShortcuts } from "renderer/routes/_authenticated/_dashboard/hooks/useHistoryNavigationShortcuts";
import { useOpenNewWorkspaceInViewedProject } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenNewWorkspaceInViewedProject";
import { useResumeMovesToThisComputer } from "renderer/routes/_authenticated/_dashboard/hooks/useResumeMovesToThisComputer";
import { useChatTabsStore } from "renderer/routes/_authenticated/_dashboard/stores/chatTabsStore";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useDevSeedSidebar } from "renderer/routes/_authenticated/hooks/useDevSeedSidebar";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useAutomationFailuresStore } from "renderer/stores/automation-failures";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { usePortsDisplayMode } from "renderer/stores/inline-workspace-ports";
import { useNotificationStore } from "renderer/stores/notifications";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { syncPersistedStoreAcrossWindows } from "renderer/stores/syncPersistedStoreAcrossWindows";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { ContentBoundary } from "../components/ContentBoundary";
import { AddRepositoryModals } from "./components/AddRepositoryModals";
import { ChatTabs } from "./components/ChatTabs";
import { ContentCard } from "./components/ContentCard";
import { NavigationRail } from "./components/NavigationRail";
import { RemotePortForwarder } from "./components/RemotePortForwarder";
import { RestoreCloudWorkspaceMount } from "./components/RestoreCloudWorkspaceMount";
import { SaveAsEnvironmentMount } from "./components/SaveAsEnvironmentMount";
import { TitleBar } from "./components/TitleBar";
import { TitleBarSlotsProvider } from "./providers/TitleBarSlotsProvider";
import { browserRuntimeRegistry } from "./workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

const relayoutBrowserPanes = () => browserRuntimeRegistry.relayout();

function DashboardLayout() {
	const navigate = useNavigate();

	const openNewWorkspace = useOpenNewWorkspace();
	const isParadevShell = useParadevShell();
	const portsDisplayMode = usePortsDisplayMode();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const quickCreateWorkspace = useQuickCreateWorkspace();
	useDevSeedSidebar();
	useEffect(() => {
		const stopWorkspaceSidebarSync = syncPersistedStoreAcrossWindows(
			useWorkspaceSidebarStore,
		);
		const stopSectionCollapseSync = syncPersistedStoreAcrossWindows(
			useSidebarSectionsCollapseStore,
		);
		const stopAgentStateSync =
			syncPersistedStoreAcrossWindows(useNotificationStore);
		const stopCloudSidebarSync =
			syncPersistedStoreAcrossWindows(useCloudSidebarStore);
		const stopAutomationFailuresSync = syncPersistedStoreAcrossWindows(
			useAutomationFailuresStore,
		);
		const stopChatTabsSync = syncPersistedStoreAcrossWindows(useChatTabsStore);

		return () => {
			stopWorkspaceSidebarSync();
			stopSectionCollapseSync();
			stopAgentStateSync();
			stopCloudSidebarSync();
			stopAutomationFailuresSync();
			stopChatTabsSync();
		};
	}, []);
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const workspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	useHistoryNavigationShortcuts();

	const currentWorkspace = useMemo(
		() =>
			currentWorkspaceId != null
				? (hostWorkspaces.find(
						(workspace) => workspace.id === currentWorkspaceId,
					) ?? null)
				: null,
		[hostWorkspaces, currentWorkspaceId],
	);
	const { machineId: localMachineId } = useLocalHostService();
	const openNewWorkspaceInViewedProject = useOpenNewWorkspaceInViewedProject();
	useWorkspaceNamingFailedToast();
	useResumeMovesToThisComputer();
	// Forwarding needs port data only for a workspace on another machine;
	// a local selection must not switch on cross-host port polling.
	// machineId is "" until the device query answers; treat unknown as local
	// rather than switching on cross-host polling for a workspace that may
	// not be remote at all.
	const selectedWorkspaceIsRemote =
		currentWorkspace != null &&
		localMachineId !== "" &&
		currentWorkspace.hostId !== localMachineId;

	const toggleWorkspaceSidebarCollapsed = useWorkspaceSidebarStore(
		(s) => s.toggleCollapsed,
	);
	const isWorkspaceSidebarCollapsed = useWorkspaceSidebarStore((s) =>
		s.isCollapsed(),
	);

	// Global hotkeys for dashboard
	useHotkey("OPEN_SETTINGS", () => navigate({ to: "/settings/account" }));
	useHotkey("SHOW_HOTKEYS", () => navigate({ to: "/settings/keyboard" }), {
		ignoreEventWhen: (e) => e.defaultPrevented,
	});
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", toggleWorkspaceSidebarCollapsed);
	useHotkey("NEW_WORKSPACE", () =>
		currentWorkspace?.projectId
			? openNewWorkspace(currentWorkspace.projectId)
			: openNewWorkspaceInViewedProject(),
	);
	useHotkey("QUICK_CREATE_WORKSPACE", () =>
		quickCreateWorkspace(currentWorkspace?.projectId ?? null),
	);

	useHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (currentWorkspaceId && currentWorkspace) {
				useDeleteWorkspaceIntent.getState().request({
					workspaceId: currentWorkspaceId,
					workspaceName: currentWorkspace.name || currentWorkspace.branch,
				});
			}
		},
		{ enabled: !!currentWorkspaceId && !!currentWorkspace },
	);

	// The collapsed rail's top strip continues the page's header row, so the
	// panel must not draw its own full-height border: the sidebar's inner
	// border, which stops below the strip, is the only divider.
	const railContinuesHeaderRow = isWorkspaceSidebarCollapsed;

	const sidebarPanel = (
		<WorkspaceSidebarPanel
			className={railContinuesHeaderRow ? "border-r-0" : undefined}
		>
			<DashboardSidebar isCollapsed={isWorkspaceSidebarCollapsed} />
		</WorkspaceSidebarPanel>
	);

	const content = (
		<ContentBoundary>
			<Outlet />
		</ContentBoundary>
	);

	const mounts = (
		<>
			<AddRepositoryModals />
			<SaveAsEnvironmentMount />
			<RestoreCloudWorkspaceMount />
		</>
	);

	return (
		// The single ports-data provider for both layout modes. It lives up here
		// (not in the sidebar) because in topbar mode the pill renders inside
		// subtrees that remount on workspace navigation (TopBar / the workspace
		// tab bar) — the data must survive those remounts or the pill blinks out
		// for the first empty-data frames. The inline chip in the sidebar reads
		// the same context; polling stays off when nothing renders ports (a
		// collapsed/closed sidebar in inline mode).
		<DashboardSidebarPortsProvider
			enabled={
				portsDisplayMode === "topbar" ||
				!isWorkspaceSidebarCollapsed ||
				// Port forwarding follows the selected remote workspace and
				// needs its port list even when no ports UI is on screen.
				selectedWorkspaceIsRemote
			}
		>
			<PortForwardsProvider>
				<RemotePortForwarder />
				{isParadevShell ? (
					<>
						<CommandPaletteHost />
						<TitleBarSlotsProvider>
							<div className="flex h-full w-full flex-col overflow-hidden bg-shell-frame">
								<TitleBar />
								<ChatTabs />
								<div className="flex min-h-0 flex-1">
									<NavigationRail />
									<WorkspaceSidebarPanel
										collapsedWidth={0}
										slides
										onLayoutFrame={relayoutBrowserPanes}
										className="mb-1.5 h-auto self-stretch rounded-l-[10px] border-y border-l border-r-0 bg-sidebar [--sidebar:var(--shell-sidebar)]"
									>
										<DashboardSidebar />
									</WorkspaceSidebarPanel>
									<ContentCard joinsSidebar={!isWorkspaceSidebarCollapsed}>
										{content}
									</ContentCard>
								</div>
							</div>
						</TitleBarSlotsProvider>
						{mounts}
					</>
				) : (
					<div className="flex h-full w-full overflow-hidden">
						<CommandPaletteHost />
						{sidebarPanel}
						<div className="flex flex-1 flex-col min-w-0 min-h-0">
							<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
								<div className="relative flex flex-1 min-h-0 min-w-0">
									{content}
								</div>
							</div>
						</div>
						{mounts}
					</div>
				)}
			</PortForwardsProvider>
		</DashboardSidebarPortsProvider>
	);
}
