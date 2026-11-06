import {
	canOpenWorkspace,
	type VersionedWorkspaceAccess,
	type WorkspaceAccess,
	type WorkspaceActor,
} from "@superset/shared/workspace-access";

/** A push the API missed is corrected within this. */
export const ACCESS_TTL_MS = 60 * 60_000;
/** After a refusal, access is read again at most this often, so a new share works at once. */
export const ACCESS_RETRY_MS = 60_000;

export type StoredAccess = VersionedWorkspaceAccess;

/** A slow lookup or a late push never undoes a change the hub already holds. */
export function supersedes(
	incoming: StoredAccess,
	current: StoredAccess | undefined,
): boolean {
	return !current || incoming.readAt >= current.readAt;
}

export type Admission =
	| { kind: "admit"; access: WorkspaceAccess; refresh: boolean }
	| { kind: "refuse" }
	| { kind: "lookup" };

/**
 * Whether the hub can decide from what it stored. Only "lookup" waits on the
 * API: a hub with nothing stored, or a refusal old enough to check again.
 */
export function admission(
	stored: StoredAccess | undefined,
	actor: WorkspaceActor,
	now: number,
): Admission {
	if (!stored) return { kind: "lookup" };
	const age = now - stored.readAt;
	if (stored.access && canOpenWorkspace(stored.access, actor)) {
		return {
			kind: "admit",
			access: stored.access,
			refresh: age >= ACCESS_TTL_MS,
		};
	}
	return age >= ACCESS_RETRY_MS ? { kind: "lookup" } : { kind: "refuse" };
}
