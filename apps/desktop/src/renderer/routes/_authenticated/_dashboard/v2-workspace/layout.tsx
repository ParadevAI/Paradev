import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useWorkspaceCreateFailuresStore } from "renderer/stores/workspace-creates";
import { WorkspaceCreateErrorState } from "./components/WorkspaceCreateErrorState";
import { WorkspaceCreatingState } from "./components/WorkspaceCreatingState";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";
import { WorkspaceProvider } from "./providers/WorkspaceProvider";

export const Route = createFileRoute("/_authenticated/_dashboard/v2-workspace")(
	{
		component: V2WorkspaceLayout,
	},
);

function V2WorkspaceLayout() {
	const matchRoute = useMatchRoute();
	const workspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const workspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const { data: workspaces, isReady } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const workspace = workspaces?.[0] ?? null;
	// Read `$synced` straight off the row — useLiveQuery returns rows enriched
	// with virtual props, and changes to optimistic state retrigger the query.
	const isSynced = workspace?.$synced ?? false;
	const failure = useWorkspaceCreateFailuresStore((store) =>
		workspaceId ? store.failures[workspaceId] : undefined,
	);

	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!workspace || lastEnsuredWorkspaceIdRef.current === workspace.id)
			return;
		// Only pin to the sidebar once the workspace is confirmed by the
		// backend — pinning an optimistic row produces a sidebar state row
		// that has to be cleaned up on rollback.
		if (!isSynced) return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace, isSynced]);

	if (!workspaceId || !isReady || !workspaces) {
		return <div className="flex h-full w-full" />;
	}

	if (workspace && !isSynced) {
		return (
			<WorkspaceCreatingState
				name={workspace.name}
				branch={workspace.branch}
				startedAt={workspace.createdAt.getTime()}
			/>
		);
	}

	if (!workspace) {
		if (failure) {
			return (
				<WorkspaceCreateErrorState
					workspaceId={workspaceId}
					name={failure.snapshot.name}
					branch={failure.snapshot.branch}
					error={failure.error}
				/>
			);
		}
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	return (
		<WorkspaceProvider workspace={workspace}>
			<Outlet />
		</WorkspaceProvider>
	);
}
