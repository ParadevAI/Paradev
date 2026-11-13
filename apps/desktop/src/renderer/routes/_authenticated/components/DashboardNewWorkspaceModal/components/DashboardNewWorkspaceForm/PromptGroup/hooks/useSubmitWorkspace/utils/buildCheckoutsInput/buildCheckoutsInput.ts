import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import type {
	LinkedPR,
	NewWorkspaceDraft,
	WorkspaceCheckout,
} from "renderer/stores/new-workspace-draft";

export interface CheckoutInput {
	baseBranch?: string;
	pr?: number;
	worktreePath?: string;
}

export interface CheckoutsInput {
	checkout: WorkspaceCheckout;
	isPrCheckout: boolean;
	checkouts?: Record<string, CheckoutInput>;
	pullRequest?: { repository: string; number: number };
}

type CheckoutsDraft = Pick<
	NewWorkspaceDraft,
	| "checkout"
	| "baseBranch"
	| "repositoryBaseBranches"
	| "repositoryPullRequests"
	| "repositoryPullRequestsFor"
	| "repositoryWorktrees"
>;

/** The checkout fields of a `workspaces.create` input, keyed by repository id. */
export function buildCheckoutsInput({
	draft,
	linkedPR,
	primaryRepositoryId,
	isMultiRepo,
}: {
	draft: CheckoutsDraft;
	linkedPR: LinkedPR | null;
	primaryRepositoryId: string | null;
	isMultiRepo: boolean;
}): CheckoutsInput {
	const checkouts: Record<string, CheckoutInput> = {};
	let pullRequest: CheckoutsInput["pullRequest"];
	const setCheckout = (repositoryId: string, checkout: CheckoutInput) => {
		checkouts[repositoryId] = { ...checkouts[repositoryId], ...checkout };
	};

	if (!isMultiRepo) {
		if (!linkedPR && draft.checkout === "local") {
			return { checkout: "local", isPrCheckout: false };
		}
		if (primaryRepositoryId) {
			if (draft.baseBranch) {
				setCheckout(primaryRepositoryId, { baseBranch: draft.baseBranch });
			}
			if (linkedPR) setCheckout(primaryRepositoryId, { pr: linkedPR.prNumber });
		} else if (linkedPR) {
			pullRequest = pullRequestInput(linkedPR);
		}
		return withCheckouts(linkedPR !== null, checkouts, pullRequest);
	}

	const isResolved =
		linkedPR !== null && draft.repositoryPullRequestsFor === linkedPR.url;
	if (isResolved) {
		// The PR picked first names the branch, so it goes first.
		const pullRequests = Object.entries(draft.repositoryPullRequests)
			.filter(([repositoryId]) => !draft.repositoryWorktrees[repositoryId])
			.sort(([, a], [, b]) => Number(a.matched) - Number(b.matched));
		for (const [repositoryId, repositoryPullRequest] of pullRequests) {
			setCheckout(repositoryId, { pr: repositoryPullRequest.prNumber });
		}
	} else if (linkedPR) {
		// Not found in a repository yet: the host matches it, or names what is missing.
		pullRequest = pullRequestInput(linkedPR);
	}
	for (const [repositoryId, baseBranch] of Object.entries(
		draft.repositoryBaseBranches,
	)) {
		if (checkouts[repositoryId] || draft.repositoryWorktrees[repositoryId]) {
			continue;
		}
		setCheckout(repositoryId, { baseBranch });
	}
	for (const [repositoryId, worktree] of Object.entries(
		draft.repositoryWorktrees,
	)) {
		setCheckout(repositoryId, { worktreePath: worktree.path });
	}
	const isPrCheckout =
		pullRequest !== undefined ||
		Object.values(checkouts).some((checkout) => checkout.pr !== undefined);
	return withCheckouts(isPrCheckout, checkouts, pullRequest);
}

function withCheckouts(
	isPrCheckout: boolean,
	checkouts: Record<string, CheckoutInput>,
	pullRequest: CheckoutsInput["pullRequest"],
): CheckoutsInput {
	return {
		checkout: "worktree",
		isPrCheckout,
		...(Object.keys(checkouts).length > 0 ? { checkouts } : {}),
		...(pullRequest ? { pullRequest } : {}),
	};
}

function pullRequestInput(linkedPR: LinkedPR): CheckoutsInput["pullRequest"] {
	const ref = pullRequestRefFromUrl(linkedPR.url);
	return ref ? { repository: ref.repoFullName, number: ref.number } : undefined;
}
