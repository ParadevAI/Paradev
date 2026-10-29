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

export type BaseBranchSource = "local" | "remote-tracking";

/** Worktree: its own checkout and branch. Local: the project's checkout as is. */
export type WorkspaceCheckout = "worktree" | "local";

export interface NewWorkspaceDraft {
	selectedProjectId: string | null;
	/** Explicit "No project" (session) choice — distinct from not-yet-selected. */
	isSession: boolean;
	hostId: string | null;
	checkout: WorkspaceCheckout;
	promptDraft: ComposerDraftSegment[];
	baseBranch: string | null;
	baseBranchSource: BaseBranchSource | null;
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
	selectProject: (projectId: string) => void;
	selectSession: () => void;
	resetDraft: () => void;
}

function buildInitialDraft(): NewWorkspaceDraft {
	return {
		selectedProjectId: null,
		isSession: false,
		hostId: null,
		checkout: useV2WorkspaceCreateDefaultsStore.getState().checkout,
		promptDraft: [],
		baseBranch: null,
		baseBranchSource: null,
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
		selectProject: (projectId) =>
			set({ selectedProjectId: projectId, isSession: false }),
		// Sessions can't check out a PR or fork a branch — clear the
		// repo-scoped inputs instead of failing at submit.
		selectSession: () =>
			set({
				selectedProjectId: null,
				isSession: true,
				baseBranch: null,
				baseBranchSource: null,
			}),
		resetDraft: () =>
			set((state) => ({
				...buildInitialDraft(),
				hostId: state.hostId,
				checkout: state.checkout,
				resetKey: state.resetKey + 1,
			})),
	}),
);
