import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/**
 * The live workspace on this host that is checked out on the pull request,
 * if any. A host that cannot answer reads as none.
 */
export async function findPullRequestWorkspace({
	hostUrl,
	projectId,
	prNumber,
}: {
	hostUrl: string | null;
	projectId: string | null;
	prNumber: number;
}): Promise<string | null> {
	if (!hostUrl || !projectId) return null;
	try {
		const { workspaceId } = await getHostServiceClientByUrl(
			hostUrl,
		).pullRequests.getLinkedWorkspace.query({ projectId, prNumber });
		return workspaceId;
	} catch {
		return null;
	}
}
