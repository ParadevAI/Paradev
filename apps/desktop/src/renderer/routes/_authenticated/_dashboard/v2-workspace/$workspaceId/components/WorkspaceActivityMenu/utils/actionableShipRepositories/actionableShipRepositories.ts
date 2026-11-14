import type { RepositoryShipStep } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryShipSnapshots/utils/repositoryShipStep";

const ACTIONABLE_STEPS: ReadonlySet<RepositoryShipStep> = new Set([
	"commit",
	"push",
	"create-pr",
	"error",
]);

/** The open repository stays, so its detail view does not close after its last step. */
export function actionableShipRepositories<
	Repository extends { repositoryId: string },
>(
	repositories: Repository[],
	snapshots: Record<string, { step: RepositoryShipStep } | undefined>,
	openRepositoryId: string | null,
): Repository[] {
	return repositories.filter(({ repositoryId }) => {
		if (repositoryId === openRepositoryId) return true;
		const step = snapshots[repositoryId]?.step;
		return step !== undefined && ACTIONABLE_STEPS.has(step);
	});
}
