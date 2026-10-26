import {
	createContext,
	type ReactNode,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import type { HostWorkspaceItem } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

type DashboardSidebarState = ReturnType<typeof useDashboardSidebarState>;

export interface DashboardSidebarActions
	extends Pick<
		DashboardSidebarState,
		| "createSection"
		| "moveWorkspaceToSection"
		| "setSectionColor"
		| "setWorkspacePinned"
	> {
	getHostWorkspaces: () => HostWorkspaceItem[];
}

const DashboardSidebarActionsContext =
	createContext<DashboardSidebarActions | null>(null);

/**
 * Rows act through this instead of subscribing themselves: the sources below
 * change on every tag write, and one subscription per row made a folder
 * delete re-render the whole sidebar once per member.
 */
export function DashboardSidebarActionsProvider({
	children,
}: {
	children: ReactNode;
}) {
	const state = useDashboardSidebarState();
	const { workspaces } = useHostWorkspaces();
	const latest = useRef({ state, workspaces });
	useLayoutEffect(() => {
		latest.current = { state, workspaces };
	});

	const actions = useMemo<DashboardSidebarActions>(
		() => ({
			createSection: (...args) => latest.current.state.createSection(...args),
			moveWorkspaceToSection: (...args) =>
				latest.current.state.moveWorkspaceToSection(...args),
			setSectionColor: (...args) =>
				latest.current.state.setSectionColor(...args),
			setWorkspacePinned: (...args) =>
				latest.current.state.setWorkspacePinned(...args),
			getHostWorkspaces: () => latest.current.workspaces,
		}),
		[],
	);

	return (
		<DashboardSidebarActionsContext.Provider value={actions}>
			{children}
		</DashboardSidebarActionsContext.Provider>
	);
}

export function useDashboardSidebarActions(): DashboardSidebarActions {
	const actions = useContext(DashboardSidebarActionsContext);
	if (!actions) {
		throw new Error(
			"useDashboardSidebarActions must be used inside DashboardSidebarActionsProvider",
		);
	}
	return actions;
}
