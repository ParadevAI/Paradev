import { cn } from "@superset/ui/utils";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import {
	useTitleBarSideWidth,
	useTitleBarSlots,
} from "../../providers/TitleBarSlotsProvider";
import { AppMenuButton } from "../AppMenuButton";
import { NavigationControls } from "../NavigationControls";
import { NAVIGATION_RAIL_WIDTH } from "../NavigationRail";
import { OfflineBadge } from "../OfflineBadge";
import { PortsDropdown } from "../PortsDropdown";
import { SidebarToggle } from "../SidebarToggle";
import { WindowControlsInset } from "../WindowControlsInset";
import { NewWorkspaceButton } from "./components/NewWorkspaceButton";

/** macOS draws the window buttons in the first 80 physical pixels, whatever the page zoom. */
const TRAFFIC_LIGHTS_WIDTH = 80;

/**
 * The window's top row: window controls and history, then the open screen's
 * tab bar, with the right pane's tab bar above the right pane.
 */
export function TitleBar() {
	const { setMain, setSide, mainClaims } = useTitleBarSlots();
	const sideWidth = useTitleBarSideWidth();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();
	const isListPanelCollapsed = useWorkspaceSidebarStore((state) =>
		state.isCollapsed(),
	);

	return (
		<div className="flex h-11 shrink-0 items-stretch">
			{isMac ? (
				<div
					className="drag h-full shrink-0"
					style={{ width: TRAFFIC_LIGHTS_WIDTH / zoomFactor }}
				/>
			) : (
				<div
					className="flex shrink-0 items-center justify-center"
					style={{ width: NAVIGATION_RAIL_WIDTH }}
				>
					<AppMenuButton />
				</div>
			)}
			<div className="flex shrink-0 items-center gap-0.5 pr-1">
				<NavigationControls />
				<SidebarToggle />
				{isListPanelCollapsed && <NewWorkspaceButton />}
				<PortsDropdown align="start" />
				<OfflineBadge />
			</div>
			<div
				ref={setMain}
				className={cn(
					"min-w-0 flex-1 overflow-hidden",
					mainClaims > 0 ? "flex" : "hidden",
				)}
			/>
			{mainClaims === 0 && <div className="drag h-full min-w-0 flex-1" />}
			<div
				ref={setSide}
				className={cn(
					"min-w-0 overflow-hidden border-l border-border",
					sideWidth === null ? "hidden" : "flex",
				)}
				style={sideWidth === null ? undefined : { flex: `0 1 ${sideWidth}px` }}
			/>
			<WindowControlsInset />
		</div>
	);
}
