import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface PullRequestWorkspaceLookup {
	hostUrl: string | null;
	projectId: string | null;
	prNumber: number;
	/** A multi-repo project's repositories reuse PR numbers; these name the one meant. */
	repositoryId?: string | null;
	repoFullName?: string | null;
}

export function pullRequestWorkspaceQueryKey({
	hostUrl,
	projectId,
	prNumber,
	repositoryId,
	repoFullName,
}: PullRequestWorkspaceLookup) {
	return [
		"pull-request-workspace",
		hostUrl,
		projectId,
		repositoryId ?? repoFullName?.toLowerCase() ?? null,
		prNumber,
	] as const;
}

export function linkedWorkspaceInput({
	projectId,
	prNumber,
	repositoryId,
	repoFullName,
}: Omit<PullRequestWorkspaceLookup, "hostUrl"> & { projectId: string }) {
	return {
		projectId,
		prNumber,
		...(repositoryId ? { repositoryId } : {}),
		...(!repositoryId && repoFullName ? { repoFullName } : {}),
	};
}

/** A host that cannot answer reads as no workspace. */
export async function findPullRequestWorkspace(
	lookup: PullRequestWorkspaceLookup,
): Promise<string | null> {
	const { hostUrl, projectId } = lookup;
	if (!hostUrl || !projectId) return null;
	try {
		const { workspaceId } = await getHostServiceClientByUrl(
			hostUrl,
		).pullRequests.getLinkedWorkspace.query(
			linkedWorkspaceInput({ ...lookup, projectId }),
		);
		return workspaceId;
	} catch {
		return null;
	}
}
