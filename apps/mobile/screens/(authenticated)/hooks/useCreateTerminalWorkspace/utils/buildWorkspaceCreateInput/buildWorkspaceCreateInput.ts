import type { AppRouter } from "@superset/host-service/router";
import type { inferRouterInputs } from "@trpc/server";

export type HostWorkspaceCreateInput =
	inferRouterInputs<AppRouter>["workspaces"]["createEnqueued"];

export function buildWorkspaceCreateInput({
	id,
	projectId,
	primaryRepositoryId,
	baseBranch,
	agents,
	namingPrompt,
	namingAgent,
}: {
	id: string;
	projectId: string;
	primaryRepositoryId: string | null | undefined;
	baseBranch: string | null;
	agents: HostWorkspaceCreateInput["agents"];
	namingPrompt?: string;
	namingAgent?: string;
}): HostWorkspaceCreateInput {
	return {
		id,
		projectId,
		checkouts:
			baseBranch && primaryRepositoryId
				? { [primaryRepositoryId]: { baseBranch } }
				: undefined,
		agents,
		namingPrompt,
		namingAgent,
	};
}
