import type { DestroyWorkspaceError } from "renderer/hooks/host-service/useDestroyWorkspace";

/** A dirty worktree the dialog never checked has had no warning shown. */
export function canSilentlyForceRetry(
	error: DestroyWorkspaceError,
	{ force, inspectFinished }: { force: boolean; inspectFinished: boolean },
): boolean {
	return error.kind === "conflict" && !force && inspectFinished;
}
