import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useCloudWorkspaceRepositories({
	organizationId,
	enabled = true,
}: {
	organizationId: string | null;
	enabled?: boolean;
}) {
	const { data, refetch, isError } =
		cloudTrpc.cloudWorkspace.repositories.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: enabled && organizationId !== null, staleTime: 5 * 60_000 },
		);
	return useMemo(() => {
		const repositoriesById = new Map<string, string[]>();
		const primaryRepositoryById = new Map<string, string>();
		for (const row of data ?? []) {
			const names = repositoriesById.get(row.cloudWorkspaceId) ?? [];
			if (row.primary) {
				names.unshift(row.fullName);
				primaryRepositoryById.set(row.cloudWorkspaceId, row.fullName);
			} else {
				names.push(row.fullName);
			}
			repositoriesById.set(row.cloudWorkspaceId, names);
		}
		return {
			repositoriesById,
			primaryRepositoryById,
			// An errored lookup still counts: rows file under the "Cloud" stand-in
			// rather than never being placed.
			isReady: data !== undefined || isError,
			refetch,
		};
	}, [data, refetch, isError]);
}
