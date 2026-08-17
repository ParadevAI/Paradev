import type { ChecksTally, MergeMethod } from "../../../../utils/pullRequest";
import type { ActionId, PullRequestState } from "../../utils/pullRequestState";

const plural = (count: number, word: string) =>
	`${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The headline names what the pull request is waiting on. Wording follows the
 * mocks: a "Waiting for X" family, counts where a count is the point, and
 * "Ready for Review" rather than "Ready to Merge" while it's still a draft.
 */
export function headlineFor(
	state: PullRequestState,
	{ isDraft, tally }: { isDraft: boolean; tally: ChecksTally },
): string {
	switch (state) {
		case "merged":
			return "PR Merged and Closed";
		case "closed":
			return "PR Closed";
		case "queued":
			return "Queued to Merge";
		case "conflicts":
			return "Resolve Conflicts to Merge";
		case "checks-failed":
			return `${plural(tally.failed, "Check")} Failed`;
		case "check-needs-action":
			return `${plural(tally.needsAction, "Check")} Need${tally.needsAction === 1 ? "s" : ""} Action`;
		case "waiting-for-checks":
			return "Waiting for Checks";
		case "changes-requested":
			return "Changes Requested";
		case "waiting-for-review":
			return "Waiting for Review";
		case "unresolved-conversations":
			return "Resolve Conversations to Merge";
		case "blocked":
			return "Blocked by Branch Rules";
		case "ready":
			return isDraft ? "Ready for Review" : "Ready to Merge";
	}
}

const MERGE_LABEL: Record<MergeMethod, string> = {
	squash: "Squash & Merge",
	merge: "Create Merge Commit",
	rebase: "Rebase & Merge",
};

/**
 * Agent labels name the blocker rather than borrowing one generic sentence —
 * we would otherwise say "Fix Checks with Agent" on a pull request with no checks.
 */
export function actionLabelFor(
	action: ActionId,
	{ mergeMethod }: { mergeMethod: MergeMethod },
): string {
	switch (action) {
		case "merge":
			return MERGE_LABEL[mergeMethod];
		case "mark-ready":
			return "Mark Ready";
		case "update-branch":
			return "Update Branch";
		case "reopen":
			return "Reopen PR";
		case "dequeue":
			return "Remove from Queue";
		case "ask-resolve-conflicts":
			return "Resolve Conflicts with Agent";
		case "ask-fix-checks":
			return "Fix Checks with Agent";
		case "ask-address-comments":
			return "Address Comments with Agent";
	}
}
