import { useEffect, useRef } from "react";
import type { NewWorkspaceDraft } from "renderer/stores/new-workspace-draft";
import { useWorkspaceCreateDefaultsStore } from "renderer/stores/workspace-create-defaults";

interface Options {
	/** The project, or on the cloud the environment, that the base branches from. */
	branchDefaultKey: string | null;
	hostId: string | null;
	updateDraft: (
		patch: Pick<NewWorkspaceDraft, "baseBranch" | "baseBranchSource">,
	) => void;
}

/**
 * Sets the draft's base branch to the user's last pick for `branchDefaultKey`,
 * on mount and on every key or host change. The draft store is global and entry
 * points select the project before this screen mounts.
 */
export function useBaseBranchReset({
	branchDefaultKey,
	hostId,
	updateDraft,
}: Options) {
	const persistedDefault = useWorkspaceCreateDefaultsStore((state) =>
		branchDefaultKey
			? (state.baseBranchesByProjectId[branchDefaultKey] ?? null)
			: null,
	);
	const seededForRef = useRef<{
		branchDefaultKey: string | null;
		hostId: string | null;
	} | null>(null);
	useEffect(() => {
		const seededFor = seededForRef.current;
		if (
			seededFor?.branchDefaultKey === branchDefaultKey &&
			seededFor.hostId === hostId
		) {
			return;
		}
		seededForRef.current = { branchDefaultKey, hostId };
		updateDraft({
			baseBranch: persistedDefault?.branchName ?? null,
			baseBranchSource: persistedDefault?.source ?? null,
		});
	}, [branchDefaultKey, hostId, persistedDefault, updateDraft]);
}
