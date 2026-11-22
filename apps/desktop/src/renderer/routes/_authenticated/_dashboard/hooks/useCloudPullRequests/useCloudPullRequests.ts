import type { RouterOutputs } from "@superset/trpc";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export type CloudPullRequestRecord =
	RouterOutputs["cloudWorkspace"]["pullRequests"][number];

export type CloudPullRequest = Pick<
	CloudPullRequestRecord,
	"url" | "number" | "title" | "state" | "isDraft" | "additions" | "deletions"
>;

export function useCloudPullRequests({
	active,
	archived,
}: {
	active: boolean;
	archived: boolean;
}): {
	byWorkspace: ReadonlyMap<string, CloudPullRequestRecord[]>;
} {
	const organizationId = useActiveOrganizationId();
	const activeQuery = cloudTrpc.cloudWorkspace.pullRequests.useQuery(
		{ organizationId: organizationId ?? "", archived: false },
		{ enabled: active && organizationId !== null },
	);
	const archivedQuery = cloudTrpc.cloudWorkspace.pullRequests.useQuery(
		{ organizationId: organizationId ?? "", archived: true },
		{ enabled: archived && organizationId !== null },
	);

	return useMemo(() => {
		const byWorkspace = new Map<string, CloudPullRequestRecord[]>();
		for (const row of [
			...(activeQuery.data ?? []),
			...(archivedQuery.data ?? []),
		]) {
			const rows = byWorkspace.get(row.cloudWorkspaceId);
			if (rows) rows.push(row);
			else byWorkspace.set(row.cloudWorkspaceId, [row]);
		}
		return { byWorkspace };
	}, [activeQuery.data, archivedQuery.data]);
}
