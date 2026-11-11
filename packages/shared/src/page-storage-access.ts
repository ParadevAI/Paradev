import type { PageManifest } from "./usercontent/manifest";

export interface PageStorageActor {
	userId: string;
	organizationIds: readonly string[];
	teamIds: readonly string[];
}

export function readable(
	manifest: PageManifest,
	actor: PageStorageActor,
): boolean {
	if (!manifest.organizationId) return false;
	if (manifest.visibility === "just_me") {
		return (
			manifest.createdByUserId === actor.userId ||
			sharedWith(manifest, manifest.organizationId, actor)
		);
	}
	return actor.organizationIds.includes(manifest.organizationId);
}

function sharedWith(
	manifest: PageManifest,
	organizationId: string,
	actor: PageStorageActor,
): boolean {
	if (!actor.organizationIds.includes(organizationId)) return false;
	return (
		(manifest.sharedUserIds ?? []).includes(actor.userId) ||
		(manifest.sharedTeamIds ?? []).some((id) => actor.teamIds.includes(id))
	);
}

export function writableFor(
	manifest: PageManifest,
	actor: PageStorageActor,
): boolean {
	return readable(manifest, actor);
}

export function guestReadable(manifest: PageManifest): boolean {
	return manifest.visibility === "everyone" && Boolean(manifest.organizationId);
}
