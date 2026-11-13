import type { GitChangedPayload } from "@superset/workspace-client";

/** Whether a `git:changed` is about this checkout. An event naming no repository is about every checkout. */
export function isForCheckout(
	payload: GitChangedPayload,
	repositoryId: string | undefined,
): boolean {
	return !payload.repositoryId || payload.repositoryId === repositoryId;
}
