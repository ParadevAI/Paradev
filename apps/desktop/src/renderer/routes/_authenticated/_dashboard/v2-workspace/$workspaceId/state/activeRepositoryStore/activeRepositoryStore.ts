import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { WorkspaceLocalStateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { areCheckoutsSettled } from "./utils/areCheckoutsSettled";
import { pickActiveRepositoryId } from "./utils/pickActiveRepositoryId";

export type WorkspaceCheckout =
	inferRouterOutputs<AppRouter>["workspace"]["get"]["checkouts"][number];

const NO_CHECKOUTS: WorkspaceCheckout[] = [];

function useWorkspaceQuery(workspaceId: string) {
	return workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ staleTime: 30_000 },
	);
}

/** The workspace's checkouts, one per repository, sorted by name; empty until loaded. */
export function useWorkspaceCheckouts(
	workspaceId: string,
): WorkspaceCheckout[] {
	return useWorkspaceQuery(workspaceId).data?.checkouts ?? NO_CHECKOUTS;
}

/** Whether the checkouts are known (or failed to load), so a git call can name its repository. */
export function useAreCheckoutsLoaded(workspaceId: string): boolean {
	return areCheckoutsSettled(useWorkspaceQuery(workspaceId));
}

export function useWorkspaceLocalStateRow(
	workspaceId: string,
): WorkspaceLocalStateRow | undefined {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	return rows[0];
}

/** The repository the picker selected; undefined for a workspace without checkouts. */
export function useActiveRepositoryId(workspaceId: string): string | undefined {
	const checkouts = useWorkspaceCheckouts(workspaceId);
	const picked = useWorkspaceLocalStateRow(workspaceId)?.activeRepositoryId;
	return pickActiveRepositoryId(checkouts, picked);
}

export function useSelectRepository(): (
	workspaceId: string,
	repositoryId: string,
) => void {
	const collections = useCollections();
	return useCallback(
		(workspaceId, repositoryId) => {
			const row = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!row || row.activeRepositoryId === repositoryId) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.activeRepositoryId = repositoryId;
			});
		},
		[collections],
	);
}
