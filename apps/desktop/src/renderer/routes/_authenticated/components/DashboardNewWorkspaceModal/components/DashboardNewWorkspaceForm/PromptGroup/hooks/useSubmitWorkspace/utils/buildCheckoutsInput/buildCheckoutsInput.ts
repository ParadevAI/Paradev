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
	| "checkoutBaseBranches"
	| "checkoutPullRequests"
	| "checkoutPullRequestsFor"
	| "checkoutWorktrees"
>;

/** The checkout fields of a `workspaces.create` input, keyed by repository id. */
export function buildCheckoutsInput({
	draft,
	linkedPR,
	primaryRepositoryId,
	isMultiRepo,
	repositoryIds,
	githubNames = {},
}: {
	draft: CheckoutsDraft;
	linkedPR: LinkedPR | null;
	primaryRepositoryId: string | null;
	isMultiRepo: boolean;
	/** The project's repositories now; a draft can still hold picks for one removed since. */
	repositoryIds: readonly string[];
	/** `owner/name` of each repository, by repository id, as the host last read it. */
	githubNames?: Readonly<Record<string, string | null>>;
}): CheckoutsInput {
	const checkouts: Record<string, CheckoutInput> = {};
	let pullRequest: CheckoutsInput["pullRequest"];
	const known = new Set(repositoryIds);
	const setCheckout = (repositoryId: string, checkout: CheckoutInput) => {
		if (isMultiRepo && !known.has(repositoryId)) return;
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

	const draftPullRequests =
		linkedPR !== null && draft.checkoutPullRequestsFor === linkedPR.url
			? Object.entries(draft.checkoutPullRequests)
			: null;
	const resolvedPullRequests =
		draftPullRequests?.filter(([repositoryId]) => known.has(repositoryId)) ??
		null;
	const resolvedOnlyForRemovedRepositories =
		draftPullRequests !== null &&
		draftPullRequests.length > 0 &&
		resolvedPullRequests?.length === 0;
	if (linkedPR && resolvedPullRequests && !resolvedOnlyForRemovedRepositories) {
		const pullRequests = resolvedPullRequests.filter(
			([repositoryId]) => !draft.checkoutWorktrees[repositoryId],
		);
		for (const [repositoryId, repositoryPullRequest] of pullRequests) {
			setCheckout(repositoryId, { pr: repositoryPullRequest.prNumber });
		}
		// The host names the branch after `pullRequest`, the PR the user linked.
		if (
			pullRequests.some(
				([, repositoryPullRequest]) => !repositoryPullRequest.matched,
			)
		) {
			pullRequest = pullRequestInput(linkedPR);
		}
	} else if (linkedPR) {
		// Not found in a repository yet: the host matches it, or names what is missing.
		const unresolved = pullRequestInput(linkedPR);
		const pickReplacesPullRequest = [
			...Object.keys(draft.checkoutWorktrees),
			...Object.keys(draft.checkoutBaseBranches),
		].some(
			(repositoryId) =>
				known.has(repositoryId) &&
				githubNames[repositoryId]?.toLowerCase() ===
					unresolved?.repository.toLowerCase(),
		);
		if (!pickReplacesPullRequest) pullRequest = unresolved;
	}
	for (const [repositoryId, baseBranch] of Object.entries(
		draft.checkoutBaseBranches,
	)) {
		if (checkouts[repositoryId] || draft.checkoutWorktrees[repositoryId]) {
			continue;
		}
		setCheckout(repositoryId, { baseBranch });
	}
	for (const [repositoryId, worktree] of Object.entries(
		draft.checkoutWorktrees,
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
