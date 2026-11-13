import { useEffect, useMemo } from "react";
import { usePRFlowState } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePRFlowState";
import {
	type RepositoryShipStep,
	repositoryShipStep,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryShipSnapshots/utils/repositoryShipStep";
import { useShipActions } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useShipActions";
import { useCheckoutGitStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import {
	type ChangesPillStats,
	changesPillStats,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/changesPillStats";
import type {
	BranchSyncStatus,
	PRFlowState,
	PullRequest,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getPRFlowState";

export interface RepositoryShipSnapshot {
	step: RepositoryShipStep;
	flowState: PRFlowState;
	stats: ChangesPillStats | null;
	sync: BranchSyncStatus | null;
	pr: PullRequest | null;
}

interface RepositoryShipReporterProps {
	workspaceId: string;
	repositoryId: string;
	/** False stops the pull request and commit polling; changed-file stats stay live. */
	enabled: boolean;
	onChange: (repositoryId: string, snapshot: RepositoryShipSnapshot) => void;
}

/** Keeps one checkout's ship state live for the multi-repo control's face. */
export function RepositoryShipReporter({
	workspaceId,
	repositoryId,
	enabled,
	onChange,
}: RepositoryShipReporterProps) {
	const status = useCheckoutGitStatus(repositoryId);
	const { flowState } = usePRFlowState(workspaceId, repositoryId, {
		enabled,
	});
	const { hasCommitsAhead } = useShipActions({
		workspaceId,
		repositoryId,
		enabled,
		onRefresh: () => {},
		isPrFormOpen: false,
		onCommitted: () => {},
		onPrCreated: () => {},
	});

	const snapshot = useMemo<RepositoryShipSnapshot>(
		() => ({
			step: repositoryShipStep(flowState, hasCommitsAhead),
			flowState,
			stats: status.data ? changesPillStats(status.data) : null,
			sync:
				flowState.kind === "no-pr" || flowState.kind === "pr-exists"
					? flowState.sync
					: null,
			pr:
				flowState.kind === "pr-exists" ||
				flowState.kind === "busy" ||
				flowState.kind === "error"
					? flowState.pr
					: null,
		}),
		[flowState, hasCommitsAhead, status.data],
	);

	useEffect(() => {
		onChange(repositoryId, snapshot);
	}, [onChange, repositoryId, snapshot]);

	return null;
}
