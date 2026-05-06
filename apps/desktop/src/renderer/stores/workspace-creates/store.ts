import type { AppRouter } from "@superset/host-service";
import type { inferRouterInputs } from "@trpc/server";
import { create } from "zustand";

export type WorkspacesCreateInput =
	inferRouterInputs<AppRouter>["workspaces"]["create"];

/**
 * Sidecar payload threaded through `collections.v2Workspaces.insert(row, { metadata })`
 * to the Electric `onInsert` handler. Carries the host-service URL plus the
 * `workspaces.create` arguments that don't live on the v2_workspaces row
 * (PR number, base branch, agent launches, original optional name/branch
 * before placeholder fallback).
 */
export interface WorkspaceCreateMeta {
	hostUrl: string;
	providedName?: string;
	providedBranch?: string;
	pr?: number;
	baseBranch?: string;
	agents?: WorkspacesCreateInput["agents"];
}

/**
 * Thrown from `onInsert` when the host service returns an existing workspace
 * with a different id than the optimistic row. The renderer's submit hook
 * catches this to redirect/clean up; Electric uses the rejection to roll
 * back the optimistic insert.
 */
export class WorkspaceAlreadyExistsAtDifferentIdError extends Error {
	readonly canonicalWorkspaceId: string;
	constructor(canonicalWorkspaceId: string) {
		super(`Workspace already exists at different id: ${canonicalWorkspaceId}`);
		this.name = "WorkspaceAlreadyExistsAtDifferentIdError";
		this.canonicalWorkspaceId = canonicalWorkspaceId;
	}
}

export interface FailedWorkspaceCreate {
	hostId: string;
	snapshot: WorkspacesCreateInput;
	error: string;
	failedAt: number;
}

interface WorkspaceCreateFailuresState {
	failures: Record<string, FailedWorkspaceCreate>;
	record: (workspaceId: string, entry: FailedWorkspaceCreate) => void;
	clear: (workspaceId: string) => void;
}

/**
 * Persists workspace creates that rolled back so the user can retry from
 * the workspace detail page. Successes don't touch this store — the
 * optimistic row in `collections.v2Workspaces` carries `$synced=false`
 * while in flight, which is the loading signal everywhere else.
 */
export const useWorkspaceCreateFailuresStore =
	create<WorkspaceCreateFailuresState>((set) => ({
		failures: {},
		record: (workspaceId, entry) =>
			set((state) => ({
				failures: { ...state.failures, [workspaceId]: entry },
			})),
		clear: (workspaceId) =>
			set((state) => {
				if (!(workspaceId in state.failures)) return state;
				const { [workspaceId]: _, ...rest } = state.failures;
				return { failures: rest };
			}),
	}));
