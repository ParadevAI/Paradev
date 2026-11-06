import { Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { GoGitPullRequest } from "react-icons/go";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import {
	LuClock,
	LuFileText,
	LuGauge,
	LuLayers,
	LuPlus,
	LuPuzzle,
	LuSearch,
} from "react-icons/lu";
import { VscFolderOpened, VscNewFolder } from "react-icons/vsc";
import { ZoomStable } from "renderer/components/ZoomStable";
import { env } from "renderer/env.renderer";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AddProjectMenuItems } from "renderer/routes/_authenticated/_dashboard/components/AddProjectMenuItems";
import { AppMenuButton } from "renderer/routes/_authenticated/_dashboard/components/AppMenuButton";
import { NavigationControls } from "renderer/routes/_authenticated/_dashboard/components/NavigationControls";
import { OfflineBadge } from "renderer/routes/_authenticated/_dashboard/components/OfflineBadge";
import { PortsDropdown } from "renderer/routes/_authenticated/_dashboard/components/PortsDropdown";
import { SidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/SidebarToggle";
import {
	WINDOW_CHROME_BAND_CLASS,
	WINDOW_CONTROLS_ROW_HEIGHT,
	WINDOW_CONTROLS_ROW_TOP,
} from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { useDashboardNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDashboardNavigation";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import { useOpenNewWorkspaceInViewedProject } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenNewWorkspaceInViewedProject";
import { useShowsAppTopBar } from "renderer/routes/_authenticated/_dashboard/hooks/useShowsAppTopBar";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { COLLAPSED_WORKSPACE_SIDEBAR_WIDTH } from "renderer/stores/workspace-sidebar-state";
import { useCommandPaletteToggle } from "../../hooks/useCommandPaletteToggle";
import { SidebarNewWorkspaceButton } from "../SidebarNewWorkspaceButton";
import { SidebarSearchButton } from "../SidebarSearchButton";

interface DashboardSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarHeader({
	isCollapsed = false,
}: DashboardSidebarHeaderProps) {
	const { t } = useLingui();
	const navigation = useDashboardNavigation();
	const openNewWorkspace = useOpenNewWorkspaceInViewedProject();
	const paletteToggle = useCommandPaletteToggle();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;
	const searchShortcutText = useHotkeyDisplay("OPEN_COMMAND_PALETTE").text;
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so we don't briefly cover the traffic lights.
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();
	const showsAppTopBar = useShowsAppTopBar();
	// `?? false`: the hook returns undefined until PostHog flags resolve.
	// Dev builds bypass the flag — the local dev account isn't in the
	// @superset.sh release condition.
	const isPluginsEnabled =
		(useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS) ?? false) ||
		env.NODE_ENV === "development";
	const { myFailedCount } = useFailedAutomations();
	const { data: isUsageInSidebarEnabled } =
		electronTrpc.settings.getShowUsageInSidebar.useQuery();

	if (isCollapsed) {
		return (
			<div className="flex flex-col">
				{/* The page's header row continues across the rail, and the macOS
				    window buttons sit in it. */}
				{!showsAppTopBar && (
					<div
						// w +1px: overlaps the container's border-r so the sidebar's
						// vertical border starts below the row, not inside it.
						className={cn(
							"drag h-12 w-[calc(100%+1px)] shrink-0",
							WINDOW_CHROME_BAND_CLASS,
						)}
					>
						{!isMac && (
							<div
								className="flex items-center justify-center"
								style={{
									width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
									marginTop: WINDOW_CONTROLS_ROW_TOP,
									height: WINDOW_CONTROLS_ROW_HEIGHT,
								}}
							>
								<AppMenuButton />
							</div>
						)}
					</div>
				)}
				{/* Mirrors the expanded header's nav container so the buttons keep
				    the same padding, order, and vertical rhythm when collapsed. */}
				<div className="flex flex-col items-center gap-1 px-2 pt-3 pb-2">
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => openNewWorkspace()}
								className="flex size-7 items-center justify-center rounded-md bg-fill-hover/60 [.light_&]:bg-fill-hover text-muted-foreground transition-colors hover:bg-fill-selected [.light_&]:hover:bg-fill-selected"
							>
								<div className="flex size-5 items-center justify-center rounded bg-fill-selected">
									<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
								</div>
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>New Workspace ({shortcutText})</Trans>
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onPointerDown={paletteToggle.onPointerDown}
								onClick={paletteToggle.onClick}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
							>
								<LuSearch className="size-3.5" strokeWidth={1.5} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{searchShortcutText !== "Unassigned"
								? t({
										message: `Search (${searchShortcutText})`,
									})
								: t({
										message: "Search",
									})}
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={navigation.openWorkspaces}
								className={cn(
									"flex size-7 items-center justify-center rounded-md transition-colors",
									navigation.isWorkspacesOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<LuLayers className="size-3.5" strokeWidth={1.5} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>Workspaces</Trans>
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={navigation.openAutomations}
								aria-label={
									myFailedCount > 0
										? t({
												message: `Automations, ${myFailedCount} failing`,
											})
										: t({
												message: "Automations",
											})
								}
								className={cn(
									"relative flex size-7 items-center justify-center rounded-md transition-colors",
									navigation.isAutomationsOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<LuClock className="size-3.5" strokeWidth={1.5} />
								{myFailedCount > 0 && (
									<span
										aria-hidden="true"
										className="absolute right-1 top-1 size-1.5 rounded-full bg-red-500"
									/>
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{myFailedCount > 0 ? (
								<Trans>Automations ({myFailedCount} failing)</Trans>
							) : (
								<Trans>Automations</Trans>
							)}
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={navigation.openTasks}
								aria-label={t({
									message: "Tasks",
								})}
								aria-current={navigation.isTasksOpen ? "page" : undefined}
								className={cn(
									"flex size-7 items-center justify-center rounded-md transition-colors",
									navigation.isTasksOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<HiOutlineClipboardDocumentList className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>Tasks</Trans>
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={navigation.openPullRequests}
								aria-label={t({
									message: "Pull requests",
								})}
								aria-current={
									navigation.isPullRequestsOpen ? "page" : undefined
								}
								className={cn(
									"flex size-7 items-center justify-center rounded-md transition-colors",
									navigation.isPullRequestsOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<GoGitPullRequest className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>Pull requests</Trans>
						</TooltipContent>
					</Tooltip>

					{isUsageInSidebarEnabled && (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={navigation.openUsage}
									aria-label={t({
										message: "Usage",
									})}
									className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
								>
									<LuGauge className="size-3.5" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">
								<Trans>Usage</Trans>
							</TooltipContent>
						</Tooltip>
					)}

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={navigation.openPages}
								aria-label={t({
									message: "Pages",
								})}
								aria-current={navigation.isPagesOpen ? "page" : undefined}
								className={cn(
									"flex size-7 items-center justify-center rounded-md transition-colors",
									navigation.isPagesOpen
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<LuFileText className="size-3.5" strokeWidth={1.5} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">
							<Trans>Pages</Trans>
						</TooltipContent>
					</Tooltip>

					{isPluginsEnabled && (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={navigation.openPlugins}
									aria-label={t({
										message: "Plugins",
									})}
									aria-current={navigation.isPluginsOpen ? "page" : undefined}
									className={cn(
										"flex size-7 items-center justify-center rounded-md transition-colors",
										navigation.isPluginsOpen
											? "bg-fill-selected text-muted-foreground"
											: "text-muted-foreground hover:bg-fill-hover",
									)}
								>
									<LuPuzzle className="size-3.5" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">
								<Trans>Plugins</Trans>
							</TooltipContent>
						</Tooltip>
					)}

					<DropdownMenu>
						<Tooltip delayDuration={700}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										aria-label={t({
											message: "Add project",
										})}
										className="group/addrepo flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover"
									>
										<VscNewFolder className="size-3.5 group-hover/addrepo:hidden" />
										<VscFolderOpened className="hidden size-3.5 group-hover/addrepo:block" />
									</button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="right">
								<Trans>Add project</Trans>
							</TooltipContent>
						</Tooltip>
						<DropdownMenuContent
							align="start"
							onCloseAutoFocus={(event) => event.preventDefault()}
						>
							<AddProjectMenuItems />
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		);
	}

	return (
		<div
			className="flex flex-col gap-px px-2 pt-2 pb-2"
			// Pin the top inset so the traffic-light row stays a constant physical
			// distance from the window top under page zoom (see the row below).
			style={{
				paddingTop: `${WINDOW_CONTROLS_ROW_TOP / (isMac ? zoomFactor : 1)}px`,
			}}
		>
			{/* -mx-2 cancels the parent's px-2 so this row owns the 80px traffic-light
			    inset; inset and height are counter-scaled to a constant physical size
			    so the fixed macOS traffic lights stay aligned under page zoom. On Mac
			    the control clusters below use ZoomStable so the collapse/nav icons and
			    usage badge keep a constant physical size instead of scaling with page
			    zoom and overflowing this fixed-height row. It's Mac-only because the
			    pinned row height it matches is Mac-only; elsewhere the row height (h-8)
			    scales with zoom, so the controls should scale with it. */}
			<div
				// Window-drag regions live on the empty spacer + filler leaves, never
				// on this row: `no-drag` carve-outs under a `drag` ancestor are lost
				// inside zoomed wrappers like ZoomStable, deadening the controls.
				className="-mx-2 mb-3 flex h-8 items-center pr-3"
				style={
					isMac
						? { height: `${WINDOW_CONTROLS_ROW_HEIGHT / zoomFactor}px` }
						: undefined
				}
			>
				{isMac ? (
					<div
						className="drag h-full shrink-0"
						style={{ width: `${80 / zoomFactor}px` }}
					/>
				) : (
					<div
						className="flex h-full shrink-0 items-center justify-center"
						style={{ width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH }}
					>
						<AppMenuButton />
					</div>
				)}
				<ZoomStable enabled={isMac} className="flex items-center gap-1">
					<SidebarToggle />
					<NavigationControls />
					{/* Lives here (persistent chrome) rather than the workspace tab
					    bar, which remounts on every navigation. */}
					<PortsDropdown align="start" />
					<OfflineBadge />
				</ZoomStable>
				<div className="drag h-full min-w-0 flex-1" />
			</div>

			<SidebarNewWorkspaceButton />
			<SidebarSearchButton />

			<button
				type="button"
				onClick={navigation.openWorkspaces}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					navigation.isWorkspacesOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<LuLayers
					className="size-4 shrink-0 text-muted-foreground"
					strokeWidth={1.5}
				/>
				<span className="flex-1 text-left">
					<Trans>Workspaces</Trans>
				</span>
			</button>

			<div className="relative">
				<button
					type="button"
					onClick={navigation.openAutomations}
					className={cn(
						"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
						navigation.isAutomationsOpen
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					<LuClock
						className="size-4 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="flex-1 text-left">
						<Trans>Automations</Trans>
					</span>
				</button>
				{myFailedCount > 0 && (
					<button
						type="button"
						onClick={navigation.openFailedAutomations}
						title={t({
							message: `${myFailedCount} of your automations failed their last run`,
						})}
						className="absolute right-2 top-1/2 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full bg-red-500/15 px-1 text-[10px] font-medium tabular-nums text-red-600 transition-colors hover:bg-red-500/25 dark:text-red-400"
					>
						{myFailedCount > 9 ? "9+" : myFailedCount}
					</button>
				)}
			</div>

			<button
				type="button"
				onClick={navigation.openTasks}
				aria-label={t({
					message: "Tasks",
				})}
				aria-current={navigation.isTasksOpen ? "page" : undefined}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					navigation.isTasksOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<HiOutlineClipboardDocumentList className="size-4 shrink-0 text-muted-foreground" />
				<span className="flex-1 text-left">
					<Trans>Tasks</Trans>
				</span>
			</button>

			<button
				type="button"
				onClick={navigation.openPullRequests}
				aria-label={t({
					message: "Pull requests",
				})}
				aria-current={navigation.isPullRequestsOpen ? "page" : undefined}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					navigation.isPullRequestsOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<GoGitPullRequest className="size-4 shrink-0 text-muted-foreground" />
				<span className="flex-1 text-left">
					<Trans>Pull requests</Trans>
				</span>
			</button>

			{isUsageInSidebarEnabled && (
				<button
					type="button"
					onClick={navigation.openUsage}
					aria-label={t({
						message: "Usage",
					})}
					className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
				>
					<LuGauge
						className="size-4 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="flex-1 text-left">
						<Trans>Usage</Trans>
					</span>
				</button>
			)}

			<button
				type="button"
				onClick={navigation.openPages}
				aria-label={t({
					message: "Pages",
				})}
				aria-current={navigation.isPagesOpen ? "page" : undefined}
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
					navigation.isPagesOpen
						? "bg-fill-selected text-foreground"
						: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
				)}
			>
				<LuFileText
					className="size-4 shrink-0 text-muted-foreground"
					strokeWidth={1.5}
				/>
				<span className="flex-1 text-left">
					<Trans>Pages</Trans>
				</span>
			</button>

			{isPluginsEnabled && (
				<button
					type="button"
					onClick={navigation.openPlugins}
					aria-label={t({
						message: "Plugins",
					})}
					aria-current={navigation.isPluginsOpen ? "page" : undefined}
					className={cn(
						"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
						navigation.isPluginsOpen
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					<LuPuzzle
						className="size-4 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
					<span className="flex-1 text-left">
						<Trans>Plugins</Trans>
					</span>
				</button>
			)}
		</div>
	);
}
