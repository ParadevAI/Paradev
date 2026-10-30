import { useSyncExternalStore } from "react";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
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
	children,
}: {
	className?: string;
	collapsedWidth?: number;
	children: React.ReactNode;
}) {
	const width = useWorkspaceSidebarStore((s) => s.width);
	const setWidth = useWorkspaceSidebarStore((s) => s.setWidth);
	const maxWidth = useSyncExternalStore(subscribeToResize, getMaxWidth);
	return (
		<ResizablePanel
			width={
				width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH
					? collapsedWidth
					: Math.min(width, maxWidth)
			}
			onWidthChange={(next) => setWidth(Math.min(next, maxWidth))}
			minWidth={collapsedWidth}
			maxWidth={maxWidth}
			handleSide="right"
			clampWidth={false}
			className={className}
			onDoubleClickHandle={() => setWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)}
		>
			{children}
		</ResizablePanel>
	);
}
