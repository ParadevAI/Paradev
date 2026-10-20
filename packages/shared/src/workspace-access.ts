export const WORKSPACE_VISIBILITIES = ["just_me", "org"] as const;

export type WorkspaceVisibility = (typeof WORKSPACE_VISIBILITIES)[number];

/** Who may open a cloud workspace, as its realtime hub holds it. */
export interface WorkspaceAccess {
	organizationId: string;
	createdByUserId: string | null;
	visibility: WorkspaceVisibility;
	sharedUserIds: string[];
	sharedTeamIds: string[];
}

export interface WorkspaceActor {
	userId: string;
	organizationIds: readonly string[];
	teamIds: readonly string[];
}

const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");

export function parseWorkspaceAccess(raw: unknown): WorkspaceAccess | null {
	if (typeof raw !== "object" || raw === null) return null;
	const access = raw as Record<string, unknown>;
	if (
		typeof access.organizationId !== "string" ||
		!(
			access.createdByUserId === null ||
			typeof access.createdByUserId === "string"
		) ||
		!(WORKSPACE_VISIBILITIES as readonly unknown[]).includes(
			access.visibility,
		) ||
		!isStringArray(access.sharedUserIds) ||
		!isStringArray(access.sharedTeamIds)
	) {
		return null;
	}
	return {
		organizationId: access.organizationId,
		createdByUserId: access.createdByUserId,
		visibility: access.visibility as WorkspaceVisibility,
		sharedUserIds: access.sharedUserIds,
		sharedTeamIds: access.sharedTeamIds,
	};
}

/** Access as the API read it at `readAt`, so a hub can drop anything older than what it holds. */
export interface VersionedWorkspaceAccess {
	access: WorkspaceAccess | null;
	readAt: number;
}

export function parseVersionedWorkspaceAccess(
	raw: unknown,
): VersionedWorkspaceAccess | null {
	if (typeof raw !== "object" || raw === null) return null;
	const { access, readAt } = raw as { access?: unknown; readAt?: unknown };
	if (typeof readAt !== "number" || !Number.isFinite(readAt)) return null;
	if (access === null) return { access: null, readAt };
	const parsed = parseWorkspaceAccess(access);
	return parsed ? { access: parsed, readAt } : null;
}

export function canOpenWorkspace(
	access: WorkspaceAccess,
	actor: WorkspaceActor,
): boolean {
	if (!actor.organizationIds.includes(access.organizationId)) return false;
	return (
		access.visibility === "org" ||
		access.createdByUserId === actor.userId ||
		access.sharedUserIds.includes(actor.userId) ||
		access.sharedTeamIds.some((teamId) => actor.teamIds.includes(teamId))
	);
}
