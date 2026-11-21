import { createContext, useContext, useMemo } from "react";
import { useGitStatus } from "renderer/hooks/host-service/useGitStatus";

type WorkspaceGitStatus = Pick<
	ReturnType<typeof useGitStatus>,
	"data" | "isLoading" | "isFetching" | "isError" | "error"
>;

const WorkspaceGitStatusContext = createContext<WorkspaceGitStatus | null>(
	null,
);

interface WorkspaceGitStatusProviderProps {
	children: React.ReactNode;
	workspaceId: string;
}

// Always enabled while the workspace route is mounted: the top-bar Changes
// pill needs status regardless of sidebar/pane state, and the query is
// event-driven (git:changed subscription + window focus), not an interval
// poll — it was effectively always-on anyway since the right sidebar
// defaults to open.
export function WorkspaceGitStatusProvider({
	children,
	workspaceId,
}: WorkspaceGitStatusProviderProps) {
	const { data, isLoading, isFetching, isError, error } = useGitStatus(
		workspaceId,
		true,
	);
	// useQuery returns a new object every render; a new context value would
	// re-render every consumer on each page render.
	const value = useMemo(
		() => ({ data, isLoading, isFetching, isError, error }),
		[data, isLoading, isFetching, isError, error],
	);

	return (
		<WorkspaceGitStatusContext.Provider value={value}>
			{children}
		</WorkspaceGitStatusContext.Provider>
	);
}

export function useWorkspaceGitStatus(): WorkspaceGitStatus {
	const value = useContext(WorkspaceGitStatusContext);
	if (!value) {
		throw new Error(
			"useWorkspaceGitStatus must be used inside WorkspaceGitStatusProvider",
		);
	}
	return value;
}
