import { useParadevShell } from "renderer/hooks/useParadevShell";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";

/** True while the sidebar is a rail: every header in the window's top row joins one band. */
export function useCollapsedSidebarBand(): boolean {
	const isParadevShell = useParadevShell();
	const isSidebarCollapsed = useWorkspaceSidebarStore((s) => s.isCollapsed());
	return !isParadevShell && isSidebarCollapsed;
}
