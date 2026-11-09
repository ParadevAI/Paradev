import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/** A host that cannot answer reads as no workspace. */
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
