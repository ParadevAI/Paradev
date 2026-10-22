/**
 * What happens to an organization's repository rows when the GitHub App
 * loses access to them. Environments and cloud workspaces reference
 * `github_repositories` by id, so a row is never deleted for that: it is
 * detached from its installation and marked, and the next grant or reinstall
 * attaches it again under whatever installation delivers it.
 */
import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";

const detached = () => ({
	installationId: null,
	disconnectedAt: new Date(),
	updatedAt: new Date(),
});

/** Every repository the installation delivered, when the installation goes. */
export async function detachInstallationRepositories(
	installationDbId: string,
): Promise<void> {
	await db
		.update(githubRepositories)
		.set(detached())
		.where(eq(githubRepositories.installationId, installationDbId));
}

/** Repositories removed from an installation's grant, by GitHub's ids. */
export async function detachRepositoriesByRepoId(
	repoIds: readonly string[],
): Promise<void> {
	if (repoIds.length === 0) return;
	await db
		.update(githubRepositories)
		.set(detached())
		.where(inArray(githubRepositories.repoId, [...repoIds]));
}

/**
 * After a full sync: whatever the installation still lists stays attached,
 * anything else it used to deliver is detached. Webhooks can be missed.
 */
export async function pruneInstallationRepositories(
	installationDbId: string,
	deliveredRepoIds: readonly string[],
): Promise<void> {
	await db
		.update(githubRepositories)
		.set(detached())
		.where(
			and(
				eq(githubRepositories.installationId, installationDbId),
				isNull(githubRepositories.disconnectedAt),
				deliveredRepoIds.length
					? notInArray(githubRepositories.repoId, [...deliveredRepoIds])
					: undefined,
			),
		);
}

/**
 * Forgets an installation; its repositories stay for whatever references
 * them. The foreign key alone would null the link; the mark is what tells a
 * picker and a workspace start that access is gone.
 */
export async function removeInstallation(
	installationDbId: string,
): Promise<void> {
	await detachInstallationRepositories(installationDbId);
	await db
		.delete(githubInstallations)
		.where(eq(githubInstallations.id, installationDbId));
}
