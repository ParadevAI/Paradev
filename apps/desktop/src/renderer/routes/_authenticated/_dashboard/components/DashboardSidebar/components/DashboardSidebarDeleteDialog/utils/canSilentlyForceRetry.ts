import type { DestroyWorkspaceError } from "renderer/hooks/host-service/useDestroyWorkspace";

/** A dirty worktree the dialog never checked has had no warning shown. */
export function canSilentlyForceRetry(
	error: DestroyWorkspaceError,
	{ force, checkedClean }: { force: boolean; checkedClean: boolean },
): boolean {
	return error.kind === "conflict" && !force && checkedClean;
}
