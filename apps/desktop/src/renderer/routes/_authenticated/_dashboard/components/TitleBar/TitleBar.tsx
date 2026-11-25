import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import { ZoomStable } from "renderer/components/ZoomStable";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	setTitleBarOverlayColor,
	useResolvedTheme,
} from "renderer/stores/theme";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { TITLE_BAR_OVERLAY_HEIGHT } from "shared/constants";
import { toHex } from "shared/themes/utils";
import {
	useTitleBarSide,
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
import { WorkspaceSwitcherButton } from "./components/WorkspaceSwitcherButton";
import { shellFrameColor } from "./utils/shellFrameColor";

/** macOS draws the window buttons in the first 80 physical pixels, whatever the page zoom. */
const TRAFFIC_LIGHTS_WIDTH = 80;
const ROW_HEIGHT = 44;

/**
 * The window's top row: window controls and history, then the open screen's
 * tab bar above the content card, with the right pane's tab bar above the
 * right pane.
 *
 * On macOS the row keeps a constant physical height under page zoom, so its
 * controls stay in line with the fixed window buttons; the tab slots
 * counter-zoom their content to match.
 */
export function TitleBar() {
	const { setMain, setSide, mainClaims, contentCard } = useTitleBarSlots();
	const leadingRef = useRef<HTMLDivElement>(null);
	const { width: sideWidth, layoutWidth: sideLayoutWidth } = useTitleBarSide();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();
	const isListPanelCollapsed = useWorkspaceSidebarStore((state) =>
		state.isCollapsed(),
	);
	const theme = useResolvedTheme();

	// The Windows/Linux window controls are painted by the window, so they take
	// this row's colour and height only while the row is on screen.
	const { background, foreground } = theme.ui;
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
		setTitleBarOverlayColor((ui) =>
			shellFrameColor(ui.background, ui.foreground),
		);
		setOverlay(shellFrameColor(background, foreground), foreground, ROW_HEIGHT);
		return () => {
			setTitleBarOverlayColor(null);
			setOverlay(background, foreground, TITLE_BAR_OVERLAY_HEIGHT);
		};
	}, [background, foreground]);
	useEffect(() => {
		const leading = leadingRef.current;
		if (!contentCard || !leading) return;
		const align = () => {
			leading.style.width = `${contentCard.getBoundingClientRect().left}px`;
		};
		align();
		const observer = new ResizeObserver(align);
		observer.observe(contentCard);
		return () => {
			observer.disconnect();
			leading.style.width = "";
		};
	}, [contentCard]);
	const slotStyle = isMac
		? {
				zoom: 1 / zoomFactor,
			}
		: undefined;

	return (
		<div
			className="hide-scrollbar flex h-11 shrink-0 items-stretch overflow-x-auto [--header-tab-selected:var(--shell-tab-selected)]"
			style={isMac ? { height: `${ROW_HEIGHT / zoomFactor}px` } : undefined}
		>
			<div ref={leadingRef} className="flex min-w-min items-stretch">
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
				<div className="flex shrink-0 items-center">
					<ZoomStable enabled={isMac} className="flex items-center gap-0.5">
						<NavigationControls />
						<SidebarToggle />
						{isListPanelCollapsed && <WorkspaceSwitcherButton />}
						{isListPanelCollapsed && <NewWorkspaceButton />}
						<PortsDropdown align="start" />
						<OfflineBadge />
					</ZoomStable>
				</div>
				<div className="drag h-full min-w-1 flex-1" />
			</div>
			<div
				className={cn(
					"flex min-w-min flex-1 overflow-hidden",
					mainClaims === 0 && "hidden",
				)}
			>
				<div
					ref={setMain}
					className="flex h-full min-w-0 flex-1"
					style={slotStyle}
				/>
			</div>
			{mainClaims === 0 && <div className="drag h-full min-w-0 flex-1" />}
			<div
				className={cn(
					"flex overflow-hidden",
					sideLayoutWidth === null ? "min-w-min" : "min-w-0 justify-end",
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
					className={cn(
						"flex h-full",
						sideLayoutWidth === null ? "min-w-0 flex-1" : "shrink-0",
					)}
					style={{
						...slotStyle,
						width:
							sideLayoutWidth === null
								? undefined
								: `calc(max(0px, ${sideLayoutWidth}px - ${WINDOW_CONTROLS_INSET_WIDTH}) * ${isMac ? zoomFactor : 1})`,
					}}
				/>
			</div>
			<WindowControlsInset inTitleBar />
		</div>
	);
}
