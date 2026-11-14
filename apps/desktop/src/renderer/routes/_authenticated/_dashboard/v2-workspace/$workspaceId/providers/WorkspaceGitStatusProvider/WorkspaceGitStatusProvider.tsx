import { workspaceTrpc } from "@superset/workspace-client";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import {
	useAreCheckoutsLoaded,
	useWorkspaceCheckouts,
} from "../../state/activeRepositoryStore";
import { CheckoutGitStatusSource } from "./components/CheckoutGitStatusSource";
import type { CheckoutGitStatus } from "./types";
import { readCachedCheckoutGitStatus } from "./utils/readCachedCheckoutGitStatus";
import {
	emptyWorkspaceScopedEntries,
	entriesForWorkspace,
	setWorkspaceScopedEntry,
	type WorkspaceScopedEntries,
} from "./utils/workspaceScopedEntries";

interface WorkspaceGitStatusContextValue {
	byRepositoryId: Record<string, CheckoutGitStatus>;
	readCached: (
		repositoryId: string | undefined,
	) => CheckoutGitStatus | undefined;
}

const WorkspaceGitStatusContext =
	createContext<WorkspaceGitStatusContextValue | null>(null);

const PENDING: CheckoutGitStatus = {
	data: undefined,
	isLoading: true,
	isFetching: false,
	isError: false,
	error: null,
};

interface WorkspaceGitStatusProviderProps {
	children: React.ReactNode;
	workspaceId: string;
}

// Always enabled while the workspace route is mounted: the top-bar Changes
// pill needs status regardless of sidebar/pane state, and each query is
// event-driven (git:changed subscription + window focus), not an interval poll.
export function WorkspaceGitStatusProvider({
	children,
	workspaceId,
}: WorkspaceGitStatusProviderProps) {
	const checkouts = useWorkspaceCheckouts(workspaceId);
	const checkoutsLoaded = useAreCheckoutsLoaded(workspaceId);
	const [statuses, setStatuses] = useState<
		WorkspaceScopedEntries<CheckoutGitStatus>
	>(emptyWorkspaceScopedEntries);
	const handleChange = useCallback(
		(sourceWorkspaceId: string, key: string, status: CheckoutGitStatus) =>
			setStatuses((prev) =>
				setWorkspaceScopedEntry(prev, sourceWorkspaceId, key, status),
			),
		[],
	);
	const byRepositoryId = entriesForWorkspace(statuses, workspaceId);
	const utils = workspaceTrpc.useUtils();
	const readCached = useCallback(
		(repositoryId: string | undefined) =>
			readCachedCheckoutGitStatus(utils.git, workspaceId, repositoryId),
		[utils, workspaceId],
	);
	const value = useMemo(
		() => ({ byRepositoryId, readCached }),
		[byRepositoryId, readCached],
	);
	const repositoryIds = useMemo<Array<string | undefined>>(
		() =>
			!checkoutsLoaded
				? []
				: checkouts.length > 0
					? checkouts.map((checkout) => checkout.repositoryId)
					: [undefined],
		[checkouts, checkoutsLoaded],
	);

	return (
		<WorkspaceGitStatusContext.Provider value={value}>
			{repositoryIds.map((repositoryId) => (
				<CheckoutGitStatusSource
					key={repositoryId ?? ""}
					workspaceId={workspaceId}
					repositoryId={repositoryId}
					onChange={handleChange}
				/>
			))}
			{children}
		</WorkspaceGitStatusContext.Provider>
	);
}

function useWorkspaceGitStatusContext(): WorkspaceGitStatusContextValue {
	const value = useContext(WorkspaceGitStatusContext);
	if (!value) {
		throw new Error(
			"Git status hooks must be used inside WorkspaceGitStatusProvider",
		);
	}
	return value;
}

/** One checkout's git status; `undefined` for a workspace without checkouts. */
export function useCheckoutGitStatus(
	repositoryId: string | undefined,
): CheckoutGitStatus {
	const { byRepositoryId, readCached } = useWorkspaceGitStatusContext();
	return (
		byRepositoryId[repositoryId ?? ""] ?? readCached(repositoryId) ?? PENDING
	);
}

/** Every checkout's git status, in checkout order; `undefined` for a workspace without checkouts. */
export function useCheckoutGitStatuses(
	repositoryIds: Array<string | undefined>,
): CheckoutGitStatus[] {
	const { byRepositoryId, readCached } = useWorkspaceGitStatusContext();
	const key = JSON.stringify(repositoryIds.map((id) => id ?? ""));
	return useMemo(
		() =>
			(JSON.parse(key) as string[]).map(
				(id) => byRepositoryId[id] ?? readCached(id || undefined) ?? PENDING,
			),
		[byRepositoryId, readCached, key],
	);
}
