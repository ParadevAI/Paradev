import { isCloudUsageRefusal } from "@superset/shared/billing";
import {
	type QueryClient,
	type UseQueryResult,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";
import {
	type SandboxAccess,
	sandboxAccess,
} from "renderer/routes/_authenticated/utils/sandboxAccess";
import { useWakeWhenStopped } from "./hooks/useWakeWhenStopped";
import {
	accessRefetchInterval,
	createFailureStreak,
	wakeRefetchInterval,
} from "./utils/accessRefetchInterval";

/**
 * The open workspace's wake is also what extends its sandbox session, which
 * stops after hours of not being asked; and if the session stops anyway, the
 * next wake is what brings it back.
 */
const OPEN_WORKSPACE_KEEPALIVE_MS = 10 * 60 * 1000;

export interface SandboxTarget {
	/** The cloud workspace's id, which is also its host address key. */
	workspaceId: string;
	organizationId: string;
	url: string;
	/** The gate address of the workspace's desktop stream, ticketed separately. */
	desktopUrl: string;
}

export interface SandboxAccessValue {
	targets: SandboxTarget[];
	/** False until the cloud list is known and every ready workspace in it has been addressed once. */
	isReady: boolean;
	/** The open workspace, when its box booted with agent sign-ins its creator has since changed. */
	agentCredentialsChangedWorkspaceId: string | null;
	usageRefusal: { workspaceId: string; error: unknown } | null;
	wakeOpenWorkspace: () => Promise<void>;
}

export const SandboxAccessContext = createContext<SandboxAccessValue | null>(
	null,
);

/** Invalidating it wakes the open workspace's box again. */
export function sandboxWakeQueryKey(workspaceId: string | undefined) {
	return ["cloud-workspace", "wake", workspaceId] as const;
}

function sandboxAccessQueryKey(workspaceId: string) {
	return ["cloud-workspace", "access", workspaceId] as const;
}

/** After a restart, which can resume the box on a new domain: fetch a fresh ticket and address. */
export function refreshSandboxAccess(
	queryClient: QueryClient,
	workspaceId: string,
): Promise<void> {
	sandboxAccess.refresh(workspaceId);
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: sandboxAccessQueryKey(workspaceId),
		}),
		queryClient.invalidateQueries({
			queryKey: sandboxWakeQueryKey(workspaceId),
		}),
	]).then(() => undefined);
}

// Module-level so useQueries keeps the combined result stable across renders:
// the provider re-renders on every route change, and a new value would
// re-render every consumer.
function combineAccess(results: UseQueryResult<SandboxAccess>[]) {
	return {
		data: results.map((result) => result.data),
		allFetched: results.every((result) => result.isFetched),
	};
}

/**
 * Keeps a live address for every ready cloud workspace.
 *
 * A sandbox has no `v2_hosts` row; it is reached through the sandbox gate
 * with a ticket the API mints, and this is the one place that asks for one.
 * Addressing talks to the Superset API, not the sandbox, so it wakes
 * nothing — a sidebar full of sleeping sandboxes must stay asleep.
 *
 * The open workspace is used at its address straight away, as if its box
 * were up; a stopped one reports itself through the host connection strip
 * like any unreachable host. Waking it runs beside that, never in front of
 * it, and hands back a fresh ticket: a resumed box can answer on a new
 * domain, which the old ticket does not point at.
 */
export function SandboxAccessProvider({ children }: { children: ReactNode }) {
	const { workspaces: cloudWorkspaces, organizationId } = useCloudWorkspaces();
	const openMatch = useMatchRoute()({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const openWorkspaceId = openMatch ? openMatch.workspaceId : undefined;

	// Only a `ready` row has a sandbox to address: `access` refuses anything
	// else, and a provisioning workspace asking for a ticket every few seconds
	// would be a retry loop against a guaranteed rejection.
	const workspaces = useMemo(
		() =>
			(cloudWorkspaces ?? []).filter(
				(workspace) => workspace.status === "ready",
			),
		[cloudWorkspaces],
	);

	useEffect(() => {
		if (!cloudWorkspaces) return;
		sandboxAccess.prune(new Set(cloudWorkspaces.map(({ id }) => id)));
	}, [cloudWorkspaces]);

	const [failureStreak] = useState(createFailureStreak);
	const access = useQueries({
		queries: workspaces.map((workspace) => ({
			queryKey: sandboxAccessQueryKey(workspace.id),
			// The gate is reachable over the public internet, so this must not
			// pause with navigator.onLine the way the default mode would.
			networkMode: "always" as const,
			queryFn: () => sandboxAccess.address(workspace.id),
			refetchInterval: (query: {
				queryHash: string;
				state: {
					data?: SandboxAccess;
					error: unknown;
					errorUpdateCount: number;
				};
			}): number =>
				accessRefetchInterval({
					data: query.state.data,
					error: query.state.error,
					consecutiveFailures: failureStreak(query.queryHash, query.state),
				}),
			refetchIntervalInBackground: true,
		})),
		combine: combineAccess,
	});

	const queryClient = useQueryClient();
	const openWorkspace =
		workspaces.find((workspace) => workspace.id === openWorkspaceId) ?? null;
	const wake = useQuery({
		queryKey: sandboxWakeQueryKey(openWorkspace?.id),
		enabled: openWorkspace !== null,
		networkMode: "always",
		queryFn: async () => {
			if (!openWorkspace) return null;
			const access = await sandboxAccess.wake(openWorkspace.id);
			queryClient.setQueryData(sandboxAccessQueryKey(openWorkspace.id), access);
			return access;
		},
		refetchInterval: (query) =>
			wakeRefetchInterval(
				{
					error: query.state.error,
					consecutiveFailures: failureStreak(query.queryHash, query.state),
				},
				OPEN_WORKSPACE_KEEPALIVE_MS,
			),
		refetchIntervalInBackground: true,
		gcTime: 0,
	});

	const { refetch: refetchWake } = wake;
	const wakeOpenWorkspace = useCallback(async () => {
		const result = await refetchWake({ cancelRefetch: false });
		if (result.error) throw result.error;
	}, [refetchWake]);

	const targets = useMemo(() => {
		const next: SandboxTarget[] = [];
		for (const [index, workspace] of workspaces.entries()) {
			const data = access.data[index];
			if (!data || !organizationId) continue;
			next.push({
				workspaceId: workspace.id,
				organizationId,
				url: data.url,
				desktopUrl: data.desktopUrl,
			});
		}
		return next;
	}, [workspaces, access, organizationId]);

	const wakeRefused = isCloudUsageRefusal(wake.error);
	useWakeWhenStopped(
		wakeRefused
			? null
			: (targets.find((target) => target.workspaceId === openWorkspace?.id)
					?.url ?? null),
		wakeOpenWorkspace,
	);

	const value = useMemo<SandboxAccessValue>(
		() => ({
			targets,
			isReady: cloudWorkspaces !== undefined && access.allFetched,
			agentCredentialsChangedWorkspaceId:
				openWorkspace && wake.data?.agentCredentialsChanged
					? openWorkspace.id
					: null,
			usageRefusal:
				openWorkspace && isCloudUsageRefusal(wake.error)
					? { workspaceId: openWorkspace.id, error: wake.error }
					: null,
			wakeOpenWorkspace,
		}),
		[
			targets,
			cloudWorkspaces,
			access,
			openWorkspace,
			wake.data,
			wake.error,
			wakeOpenWorkspace,
		],
	);

	return (
		<SandboxAccessContext.Provider value={value}>
			{children}
		</SandboxAccessContext.Provider>
	);
}

const NO_SANDBOX_ACCESS: SandboxAccessValue = {
	targets: [],
	isReady: true,
	agentCredentialsChangedWorkspaceId: null,
	usageRefusal: null,
	wakeOpenWorkspace: async () => {},
};

/** Empty (never null) so consumers work outside the provider, e.g. in tests. */
export function useSandboxAccess(): SandboxAccessValue {
	return useContext(SandboxAccessContext) ?? NO_SANDBOX_ACCESS;
}
