import type {
	ComposerDraftSegment,
	PromptInputAttachment,
} from "@superset/chat-ui/PromptInput";
import { create } from "zustand";
import { useV2WorkspaceCreateDefaultsStore } from "./v2-workspace-create-defaults";

export type LinkedIssue = {
	slug: string;
	title: string;
	source?: "github" | "internal" | "linear";
	url?: string;
	taskId?: string;
	/** Provider branch name (e.g. Linear's), synced into `tasks.branch`. */
	branch?: string;
	number?: number;
	state?: "open" | "closed";
};

export type LinkedPR = {
	prNumber: number;
	title: string;
	url: string;
	state: string;
};

/** A multi-repo repository that starts from a PR; `matched` when found by its head branch. */
export type RepositoryPullRequest = LinkedPR & {
	headRefName: string;
	matched: boolean;
};

/** A multi-repo repository that starts from one of its existing worktrees. */
export interface RepositoryWorktree {
	path: string;
	branch: string;
}

export type BaseBranchSource = "local" | "remote-tracking";

/** Worktree: its own checkout and branch. Local: the project's checkout as is. */
export type WorkspaceCheckout = "worktree" | "local";

export interface NewWorkspaceDraft {
	selectedProjectId: string | null;
	/** `owner/name`, so the pick can follow its repository to another host. */
	selectedProjectRepository: string | null;
	/** Explicit "No project" (session) choice — distinct from not-yet-selected. */
	isSession: boolean;
	checkout: WorkspaceCheckout;
	promptDraft: ComposerDraftSegment[];
	baseBranch: string | null;
	baseBranchSource: BaseBranchSource | null;
	/** Multi-repo projects: picked base branches by repository id. */
	repositoryBaseBranches: Record<string, string>;
	/** Multi-repo projects: the PR each repository starts from, by repository id. */
	repositoryPullRequests: Record<string, RepositoryPullRequest>;
	/** The linked PR `repositoryPullRequests` was found for. */
	repositoryPullRequestsFor: string | null;
	/** Multi-repo projects: the existing worktree each repository moves in, by repository id. */
	repositoryWorktrees: Record<string, RepositoryWorktree>;
	workspaceName: string;
	workspaceNameEdited: boolean;
	branchName: string;
	branchNameEdited: boolean;
	/**
	 * True while branchName is the provider's own branch name (Linear's
	 * branchName) seeded by linking an issue. Cleared on manual edits.
	 * Provider branches are created verbatim — no project branch prefix.
	 */
	branchNameFromProvider: boolean;
	selectedAgentId: string | null;
	promptAttachments: PromptInputAttachment[];
}

interface NewWorkspaceDraftState extends NewWorkspaceDraft {
	resetKey: number;
	updateDraft: (patch: Partial<NewWorkspaceDraft>) => void;
	selectProject: (projectId: string, repository?: string | null) => void;
	selectSession: () => void;
	resetDraft: () => void;
}

function buildInitialDraft(): NewWorkspaceDraft {
	return {
		selectedProjectId: null,
		selectedProjectRepository: null,
		isSession: false,
		checkout: useV2WorkspaceCreateDefaultsStore.getState().checkout,
		promptDraft: [],
		baseBranch: null,
		baseBranchSource: null,
		repositoryBaseBranches: {},
		repositoryPullRequests: {},
		repositoryPullRequestsFor: null,
		repositoryWorktrees: {},
		workspaceName: "",
		workspaceNameEdited: false,
		branchName: "",
		branchNameEdited: false,
		branchNameFromProvider: false,
		selectedAgentId: null,
		promptAttachments: [],
	};
}

export const useNewWorkspaceDraftStore = create<NewWorkspaceDraftState>(
	(set) => ({
		...buildInitialDraft(),
		resetKey: 0,
		updateDraft: (patch) => set((state) => ({ ...state, ...patch })),
		// The only writers of the selectedProjectId/isSession pair — a project
		// selection that leaves isSession behind makes submit reject PR
		// checkouts while the picker shows the project as selected.
		selectProject: (projectId, repository = null) =>
			set({
				selectedProjectId: projectId,
				selectedProjectRepository: repository,
				isSession: false,
			}),
		// Sessions can't check out a PR or fork a branch — clear the
		// repo-scoped inputs instead of failing at submit.
		selectSession: () =>
			set({
				selectedProjectId: null,
				selectedProjectRepository: null,
				isSession: true,
				baseBranch: null,
				baseBranchSource: null,
				repositoryBaseBranches: {},
				repositoryPullRequests: {},
				repositoryPullRequestsFor: null,
				repositoryWorktrees: {},
			}),
		resetDraft: () =>
			set((state) => ({
				...buildInitialDraft(),
				checkout: state.checkout,
				resetKey: state.resetKey + 1,
			})),
	}),
);
