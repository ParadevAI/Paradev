import { cn } from "@superset/ui/utils";
import { useEffect } from "react";
import { ZoomStable } from "renderer/components/ZoomStable";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useResolvedTheme } from "renderer/stores/theme";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { TITLE_BAR_OVERLAY_HEIGHT } from "shared/constants";
import { toHex } from "shared/themes/utils";
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
import {
	WINDOW_CONTROLS_INSET_WIDTH,
	WindowControlsInset,
} from "../WindowControlsInset";
import { NewWorkspaceButton } from "./components/NewWorkspaceButton";

/** macOS draws the window buttons in the first 80 physical pixels, whatever the page zoom. */
const TRAFFIC_LIGHTS_WIDTH = 80;
const ROW_HEIGHT = 44;

/**
 * The window's top row: window controls and history, then the open screen's
 * tab bar, with the right pane's tab bar above the right pane.
 *
 * On macOS the row keeps a constant physical height under page zoom, so its
 * controls stay in line with the fixed window buttons; the tab slots
 * counter-zoom their content to match.
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
	const theme = useResolvedTheme();

	// The Windows/Linux window controls are painted by the window, so they take
	// this row's colour and height only while the row is on screen.
	const { background, foreground, sidebar, sidebarForeground } = theme.ui;
	useEffect(() => {
		const setOverlay = (color: string, symbolColor: string, height: number) =>
			electronTrpcClient.window.setTitleBarOverlay
				.mutate({
					color: toHex(color),
					symbolColor: toHex(symbolColor),
					height,
				})
				.catch((error: unknown) => {
					console.warn("[TitleBar] window controls overlay not updated", error);
				});
		setOverlay(sidebar, sidebarForeground, ROW_HEIGHT);
		return () => {
			setOverlay(background, foreground, TITLE_BAR_OVERLAY_HEIGHT);
		};
	}, [background, foreground, sidebar, sidebarForeground]);
	const slotStyle = isMac
		? {
				zoom: 1 / zoomFactor,
				width: `${zoomFactor * 100}%`,
				height: `${zoomFactor * 100}%`,
			}
		: undefined;

	return (
		<div
			className="flex h-11 shrink-0 items-stretch"
			style={isMac ? { height: `${ROW_HEIGHT / zoomFactor}px` } : undefined}
		>
			{isMac ? (
				<div
					className="drag h-full shrink-0"
					style={{ width: TRAFFIC_LIGHTS_WIDTH / zoomFactor }}
				/>
			) : (
				<>
					<div
						className="drag h-full shrink-0"
						style={{ width: "env(titlebar-area-x, 0px)" }}
					/>
					<div
						className="flex shrink-0 items-center justify-center"
						style={{ width: NAVIGATION_RAIL_WIDTH }}
					>
						<AppMenuButton />
					</div>
				</>
			)}
			<div className="flex shrink-0 items-center pr-1">
				<ZoomStable enabled={isMac} className="flex items-center gap-0.5">
					<NavigationControls />
					<SidebarToggle />
					{isListPanelCollapsed && <NewWorkspaceButton />}
					<PortsDropdown align="start" />
					<OfflineBadge />
				</ZoomStable>
			</div>
			<div
				className={cn(
					"relative min-w-0 flex-1 overflow-hidden",
					mainClaims === 0 && "hidden",
				)}
			>
				<div
					ref={setMain}
					className="absolute top-0 left-0 flex size-full"
					style={slotStyle}
				/>
			</div>
			{mainClaims === 0 && <div className="drag h-full min-w-0 flex-1" />}
			<div
				className={cn(
					"relative min-w-0 overflow-hidden border-l border-border",
					sideWidth === null && "hidden",
				)}
				style={
					sideWidth === null
						? undefined
						: {
								flex: `0 1 max(0px, calc(${sideWidth}px - ${WINDOW_CONTROLS_INSET_WIDTH}))`,
							}
				}
			>
				<div
					ref={setSide}
					className="absolute top-0 left-0 flex size-full"
					style={slotStyle}
				/>
			</div>
			<WindowControlsInset inTitleBar />
		</div>
	);
}
