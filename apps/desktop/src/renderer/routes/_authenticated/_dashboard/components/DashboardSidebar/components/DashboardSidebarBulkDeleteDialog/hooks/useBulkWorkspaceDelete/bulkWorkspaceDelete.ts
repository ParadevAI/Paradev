import type { DestroyWorkspacePreview } from "renderer/hooks/host-service/useDestroyWorkspace";

export type BulkWorkspaceInspectionState =
	| { status: "loading" }
	| { status: "ready"; preview: DestroyWorkspacePreview }
	| { status: "error" };

interface BulkWorkspaceInspectionItem {
	workspaceId: string;
	workspaceName: string;
	status: "loading" | "error" | "blocked" | "ready";
	reason: string | null;
	hasChanges: boolean;
	hasUnpushedCommits: boolean;
	/** Known only once inspected: the row lives on the project checkout. */
	sharesProjectCheckout: boolean | null;
}

export async function executeBulkWorkspaceDeleteTargets<
	Workspace,
	Result,
	Failure,
>({
	targets,
	concurrency,
	shouldForce,
	shouldRetryWithForce,
	destroy,
	onSettled,
}: {
	targets: readonly Workspace[];
	concurrency: number;
	shouldForce: (workspace: Workspace) => boolean;
	/** Retry a failed unforced destroy once with force. Used for conflicts on
	 * workspaces whose preview never completed — "Delete without checking" is
	 * the user's consent. Checked-clean races stay failures (no silent force). */
	shouldRetryWithForce?: (workspace: Workspace, error: Failure) => boolean;
	destroy: (workspace: Workspace, force: boolean) => Promise<Result>;
	onSettled?: () => void;
}): Promise<{
	successes: Array<{ workspace: Workspace; result: Result }>;
	failures: Array<{ workspace: Workspace; error: Failure }>;
}> {
	type Outcome =
		| { ok: true; workspace: Workspace; result: Result }
		| { ok: false; workspace: Workspace; error: Failure };
	const outcomes: Outcome[] = new Array(targets.length);

	const destroyOne = async (workspace: Workspace): Promise<Outcome> => {
		try {
			const force = shouldForce(workspace);
			try {
				return { ok: true, workspace, result: await destroy(workspace, force) };
			} catch (error) {
				if (!force && shouldRetryWithForce?.(workspace, error as Failure)) {
					return {
						ok: true,
						workspace,
						result: await destroy(workspace, true),
					};
				}
				throw error;
			}
		} catch (error) {
			return { ok: false, workspace, error: error as Failure };
		} finally {
			onSettled?.();
		}
	};

	let nextIndex = 0;
	const worker = async () => {
		while (nextIndex < targets.length) {
			const index = nextIndex++;
			outcomes[index] = await destroyOne(targets[index] as Workspace);
		}
	};
	const workerCount = Number.isFinite(concurrency)
		? Math.min(Math.max(1, Math.floor(concurrency)), targets.length)
		: 1;
	await Promise.all(Array.from({ length: workerCount }, worker));

	const successes: Array<{ workspace: Workspace; result: Result }> = [];
	const failures: Array<{ workspace: Workspace; error: Failure }> = [];
	for (const outcome of outcomes) {
		if (outcome.ok) {
			successes.push({ workspace: outcome.workspace, result: outcome.result });
		} else {
			failures.push({ workspace: outcome.workspace, error: outcome.error });
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
				sharesProjectCheckout: null,
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
				sharesProjectCheckout: null,
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
				sharesProjectCheckout: false,
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
			sharesProjectCheckout: inspection.preview.sharesProjectCheckout === true,
		};
	});
	// Unknown rows count as worktrees: the destructive copy is the safe default.
	const worktreeCount = items.filter(
		(item) => item.sharesProjectCheckout !== true,
	).length;

	return {
		loadingCount,
		errorCount,
		// Pending or failed checks flip the confirm copy to "Delete without
		// checking" instead of disabling confirmation.
		uncheckedCount: loadingCount + errorCount,
		blocked,
		changedCount,
		unpushedCount,
		worktreeCount,
		items,
		// Checks never gate deletion — only hard blockers (main workspaces,
		// which the host refuses anyway) do.
		canConfirm: workspaces.length > 0 && blocked.length === 0,
	};
}
