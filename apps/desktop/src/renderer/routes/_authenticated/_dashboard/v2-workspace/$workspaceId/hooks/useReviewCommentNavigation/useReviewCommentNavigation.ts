import { workspaceTrpc } from "@superset/workspace-client";
import { useSettings } from "renderer/stores/settings";
import {
	useAreCheckoutsLoaded,
	useWorkspaceCheckouts,
} from "../../state/activeRepositoryStore";
import type { DiffFocusSide, DiffPaneFilter } from "../../types";
import { checkoutInput } from "../../utils/checkoutInput";
import { getChangesetFileKey } from "../useChangeset";

export type OpenReviewDiff = (
	path: string,
	openInNewTab?: boolean,
	line?: number,
	side?: DiffFocusSide,
	changeKey?: string,
	filter?: DiffPaneFilter,
	repositoryId?: string,
) => void;

export function useReviewCommentNavigation(
	workspaceId: string,
	repositoryId: string | undefined,
	onSelectDiffFile?: OpenReviewDiff,
) {
	const isMultiRepo = useWorkspaceCheckouts(workspaceId).length > 1;
	// A multi-repo diff tags each entry with its repository.
	const tag = isMultiRepo ? repositoryId : undefined;
	const checkoutsLoaded = useAreCheckoutsLoaded(workspaceId);
	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		checkoutInput(workspaceId, repositoryId),
		{
			enabled:
				checkoutsLoaded &&
				onSelectDiffFile !== undefined &&
				(!isMultiRepo || repositoryId !== undefined),
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
	return onSelectDiffFile
		? (
				path: string,
				line?: number,
				openInNewTab?: boolean,
				side?: DiffFocusSide,
			) => {
				// Force annotations on so the user lands on the comment, not an empty line.
				useSettings.getState().update("showDiffComments", true);
				// Only disambiguate once the real base branch is known — while
				// baseBranchQuery is still loading, omit changeKey so this falls
				// back to the old (safe) "first item whose path matches" behavior
				// instead of building a changeKey with a guessed-empty base branch
				// that won't match the real item once it resolves.
				const changeKey = baseBranchQuery.isSuccess
					? getChangesetFileKey({
							path,
							repositoryId: tag,
							status: "modified",
							additions: 0,
							deletions: 0,
							source: {
								kind: "against-base",
								baseBranch: baseBranchQuery.data.baseBranch,
							},
						})
					: undefined;
				onSelectDiffFile(
					path,
					openInNewTab ?? false,
					line,
					side,
					changeKey,
					undefined,
					repositoryId,
				);
			}
		: undefined;
}
