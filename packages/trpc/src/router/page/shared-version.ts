import type { SelectPage } from "@superset/db/schema";

export function servedVersion(
	sharedVersion: number | null,
	latestVersion: number | null,
): number | null {
	return sharedVersion ?? latestVersion;
}

export function isPubliclyServed(
	page: Pick<SelectPage, "visibility" | "takenDownAt">,
): boolean {
	return page.visibility === "everyone" && !page.takenDownAt;
}

export function resolveSharedVersion(
	picked: number | null,
	latestVersion: number | null,
): number | null {
	if (picked === null) return null;
	return picked === latestVersion ? null : picked;
}
