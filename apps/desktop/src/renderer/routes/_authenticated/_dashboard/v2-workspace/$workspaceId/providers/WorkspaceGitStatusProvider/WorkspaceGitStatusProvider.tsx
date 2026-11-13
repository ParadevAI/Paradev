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

type StatusByRepositoryId = Record<string, CheckoutGitStatus>;

const WorkspaceGitStatusContext = createContext<StatusByRepositoryId | null>(
	null,
);

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
	const [byRepositoryId, setByRepositoryId] = useState<StatusByRepositoryId>(
		{},
	);
	const handleChange = useCallback(
		(key: string, status: CheckoutGitStatus) =>
			setByRepositoryId((prev) =>
				prev[key] === status ? prev : { ...prev, [key]: status },
			),
		[],
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
		<WorkspaceGitStatusContext.Provider value={byRepositoryId}>
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

function useStatusByRepositoryId(): StatusByRepositoryId {
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
	return useStatusByRepositoryId()[repositoryId ?? ""] ?? PENDING;
}

/** Every checkout's git status, in checkout order; `undefined` for a workspace without checkouts. */
export function useCheckoutGitStatuses(
	repositoryIds: Array<string | undefined>,
): CheckoutGitStatus[] {
	const byRepositoryId = useStatusByRepositoryId();
	const key = JSON.stringify(repositoryIds.map((id) => id ?? ""));
	return useMemo(
		() =>
			(JSON.parse(key) as string[]).map((id) => byRepositoryId[id] ?? PENDING),
		[byRepositoryId, key],
	);
}
