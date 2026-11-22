import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import { useCloudScopeEnabled } from "@/screens/(authenticated)/(home)/hooks/useCloudScopeEnabled";
import type { CloudRepos } from "../../utils/buildCloudSection";

function cloudReposQueryKey(organizationId: string | null) {
	return ["cloud", "cloudWorkspace", "repositories", organizationId] as const;
}

export function useCloudRepos(): CloudRepos {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const enabledByFlag = useCloudScopeEnabled();
	const { workspaces } = useCloudWorkspaces();

	const query = useQuery({
		queryKey: cloudReposQueryKey(organizationId),
		enabled: enabledByFlag && organizationId !== null,
		staleTime: 5 * 60_000,
		queryFn: () =>
			apiClient.cloudWorkspace.repositories.query({
				organizationId: organizationId as string,
			}),
	});

	// A workspace created since the last answer has its repositories recorded
	// at create; ask again once for it rather than file it under no repository.
	const { data, isSuccess, isFetching, refetch } = query;
	const askedFor = useRef(new Set<string>());
	useEffect(() => {
		if (!isSuccess || isFetching) return;
		const known = new Set(data.map((row) => row.cloudWorkspaceId));
		const unknown = workspaces.filter(
			(workspace) =>
				!known.has(workspace.id) && !askedFor.current.has(workspace.id),
		);
		if (unknown.length === 0) return;
		for (const workspace of unknown) askedFor.current.add(workspace.id);
		void refetch();
	}, [data, isSuccess, isFetching, refetch, workspaces]);

	return useMemo((): CloudRepos => {
		if (data) {
			return {
				status: "success",
				byWorkspace: new Map(
					data
						.filter((row) => row.primary)
						.map((row) => [
							row.cloudWorkspaceId,
							{ id: row.repositoryId, fullName: row.fullName },
						]),
				),
			};
		}
		return { status: query.isError ? "error" : "pending" };
	}, [data, query.isError]);
}
