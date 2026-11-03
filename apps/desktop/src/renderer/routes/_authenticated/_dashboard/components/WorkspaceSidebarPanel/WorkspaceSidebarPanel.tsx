import { type ReactNode, useSyncExternalStore } from "react";
import { SidebarSlide } from "renderer/routes/_authenticated/_dashboard/components/SidebarSlide";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { useAutoCollapseInNarrowWindow } from "./hooks/useAutoCollapseInNarrowWindow";
import { getWorkspaceSidebarMaxWidth } from "./utils/getWorkspaceSidebarMaxWidth";

const subscribeToResize = (onChange: () => void) => {
	window.addEventListener("resize", onChange);
	return () => window.removeEventListener("resize", onChange);
};
const getMaxWidth = () => getWorkspaceSidebarMaxWidth(window.innerWidth);

export function WorkspaceSidebarPanel({
	className,
	/** What the panel shows while collapsed: its own icon rail, or nothing beside a separate one. */
	collapsedWidth = COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	slides = false,
	children,
}: {
	className?: string;
	collapsedWidth?: number;
	slides?: boolean;
	children: ReactNode | ((hidden: boolean) => ReactNode);
}) {
	const width = useWorkspaceSidebarStore((s) => s.width);
	const lastExpandedWidth = useWorkspaceSidebarStore(
		(s) => s.lastExpandedWidth,
	);
	const setWidth = useWorkspaceSidebarStore((s) => s.setWidth);
	const maxWidth = useSyncExternalStore(subscribeToResize, getMaxWidth);
	useAutoCollapseInNarrowWindow();
	const isCollapsed = width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH;
	const expandedWidth = Math.min(
		isCollapsed ? lastExpandedWidth : width,
		maxWidth,
	);

	const renderPanel = (shownWidth: number, hidden: boolean) => (
		<ResizablePanel
			width={shownWidth}
			onWidthChange={(next) => setWidth(Math.min(next, maxWidth))}
			minWidth={collapsedWidth}
			maxWidth={maxWidth}
			handleSide="right"
			clampWidth={false}
			className={className}
			onDoubleClickHandle={() => setWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)}
		>
			{typeof children === "function" ? children(hidden) : children}
		</ResizablePanel>
	);

	if (!slides) {
		return renderPanel(
			isCollapsed ? collapsedWidth : expandedWidth,
			isCollapsed,
		);
	}

	return (
		<SidebarSlide
			mode={isCollapsed ? "closed" : "open"}
			width={expandedWidth}
			edge="left"
			alwaysMounted
		>
			{(_fill, hidden) => renderPanel(expandedWidth, hidden)}
		</SidebarSlide>
	);
}
