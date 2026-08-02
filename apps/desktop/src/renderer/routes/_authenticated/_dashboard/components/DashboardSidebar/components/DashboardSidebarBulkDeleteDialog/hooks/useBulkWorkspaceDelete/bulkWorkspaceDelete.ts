import type { DestroyWorkspacePreview } from "renderer/hooks/host-service/useDestroyWorkspace";

export type BulkWorkspaceInspectionState =
	| { status: "loading" }
	| { status: "ready"; preview: DestroyWorkspacePreview }
	| { status: "error" };

export interface BulkWorkspaceInspectionItem {
	workspaceId: string;
	workspaceName: string;
	status: "loading" | "error" | "blocked" | "ready";
	reason: string | null;
	hasChanges: boolean;
	hasUnpushedCommits: boolean;
}

export async function executeBulkWorkspaceDeleteTargets<
	Workspace,
	Result,
	Failure,
>({
	targets,
	shouldForce,
	destroy,
	onSettled,
}: {
	targets: readonly Workspace[];
	shouldForce: (workspace: Workspace) => boolean;
	destroy: (workspace: Workspace, force: boolean) => Promise<Result>;
	onSettled?: () => void;
}): Promise<{
	successes: Array<{ workspace: Workspace; result: Result }>;
	failures: Array<{ workspace: Workspace; error: Failure }>;
}> {
	const successes: Array<{ workspace: Workspace; result: Result }> = [];
	const failures: Array<{ workspace: Workspace; error: Failure }> = [];

	for (const workspace of targets) {
		try {
			const result = await destroy(workspace, shouldForce(workspace));
			successes.push({ workspace, result });
		} catch (error) {
			failures.push({ workspace, error: error as Failure });
		} finally {
			onSettled?.();
		}
	}

	return { successes, failures };
}

export function buildBulkWorkspaceInspectionSummary(
	workspaces: readonly { id: string; name: string; branch: string }[],
	inspections: ReadonlyMap<string, BulkWorkspaceInspectionState>,
) {
	let loadingCount = 0;
	let errorCount = 0;
	const blocked: Array<{
		workspaceId: string;
		workspaceName: string;
		reason: string;
	}> = [];
	let changedCount = 0;
	let unpushedCount = 0;

	const items = workspaces.map((workspace): BulkWorkspaceInspectionItem => {
		const workspaceName = workspace.name || workspace.branch;
		const inspection = inspections.get(workspace.id);
		if (!inspection || inspection.status === "loading") {
			loadingCount += 1;
			return {
				workspaceId: workspace.id,
				workspaceName,
				status: "loading",
				reason: null,
				hasChanges: false,
				hasUnpushedCommits: false,
			};
		}
		if (inspection.status === "error") {
			errorCount += 1;
			return {
				workspaceId: workspace.id,
				workspaceName,
				status: "error",
				reason: "Couldn’t verify workspace",
				hasChanges: false,
				hasUnpushedCommits: false,
			};
		}
		if (!inspection.preview.canDelete) {
			blocked.push({
				workspaceId: workspace.id,
				workspaceName,
				reason: inspection.preview.reason,
			});
			return {
				workspaceId: workspace.id,
				workspaceName,
				status: "blocked",
				reason: inspection.preview.reason,
				hasChanges: false,
				hasUnpushedCommits: false,
			};
		}

		if (inspection.preview.hasChanges) changedCount += 1;
		if (inspection.preview.hasUnpushedCommits) unpushedCount += 1;
		return {
			workspaceId: workspace.id,
			workspaceName,
			status: "ready",
			reason: null,
			hasChanges: inspection.preview.hasChanges,
			hasUnpushedCommits: inspection.preview.hasUnpushedCommits,
		};
	});

	return {
		loadingCount,
		errorCount,
		blocked,
		changedCount,
		unpushedCount,
		items,
		canConfirm:
			workspaces.length > 0 &&
			loadingCount === 0 &&
			errorCount === 0 &&
			blocked.length === 0,
	};
}
