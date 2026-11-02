import type {
	PullRequestCheck,
	PullRequestMergeability,
	PullRequestReviewDecision,
} from "@superset/shared/pull-request";
import {
	checkRunStatus,
	computeChecksStatus,
} from "@superset/shared/pull-request-checks";
import type {
	PullRequestDetailCheck,
	PullRequestDetailRead,
} from "@superset/shared/pull-request-detail";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";

/** One row per check name; a re-run replaces the run it supersedes. */
function toChecks(checks: PullRequestDetailCheck[]): PullRequestCheck[] {
	const latest = new Map<string, PullRequestDetailCheck>();
	const at = (check: PullRequestDetailCheck) =>
		Date.parse(check.completedAt ?? check.startedAt ?? "") || 0;
	for (const check of checks) {
		const seen = latest.get(check.name);
		if (!seen || at(check) >= at(seen)) latest.set(check.name, check);
	}
	return [...latest.values()].map((check) => ({
		name: check.name,
		status: checkRunStatus(check.status, check.conclusion),
		url: check.detailsUrl,
	}));
}

function reviewDecision(value: string | null): PullRequestReviewDecision {
	switch (value) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes_requested";
		case "REVIEW_REQUIRED":
			return "pending";
		default:
			return null;
	}
}

function mergeability(value: string): PullRequestMergeability {
	if (value === "MERGEABLE") return "mergeable";
	if (value === "CONFLICTING") return "conflicting";
	return "unknown";
}

/** GitHub's detail read, asked for with `activity: true`, in the shape the desktop renders. */
export function toPullRequestDetail(
	read: PullRequestDetailRead,
	repoFullName: string,
): PullRequestDetail {
	const { pullRequest: pr, activity } = read;
	const checks = toChecks(read.checks);
	return {
		repoFullName,
		number: pr.number,
		url: pr.url,
		title: pr.title,
		body: pr.body,
		state: pr.state,
		isDraft: pr.isDraft,
		author: activity?.author ?? null,
		head: {
			ref: activity?.headBranch ?? "",
			repoFullName: activity?.headRepoFullName ?? null,
		},
		base: { ref: pr.baseBranch },
		reviewDecision: reviewDecision(read.mergeability.reviewDecision),
		checksStatus: computeChecksStatus(checks),
		checks,
		createdAt: activity?.createdAt ?? "",
		updatedAt: activity?.updatedAt ?? "",
		additions: pr.additions,
		deletions: pr.deletions,
		changedFiles: pr.changedFiles,
		mergeability: mergeability(read.mergeability.mergeable),
		mergedAt: pr.mergedAt,
		closedAt: activity?.closedAt ?? null,
		reviewers: read.reviewers.map((reviewer) => ({
			login: reviewer.login,
			name: null,
		})),
		comments: activity?.comments ?? [],
		commits: activity?.commits ?? [],
		labels: activity?.labels ?? [],
		capabilities: read.capabilities,
	};
}
