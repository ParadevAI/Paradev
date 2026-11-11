import { workspaceTrpc } from "@superset/workspace-client";
import { createContext, type ReactNode, useContext, useMemo } from "react";

interface RepositoryHost {
	hostId: string;
	hostUrl: string;
	checkoutIds: ReadonlySet<string>;
}

const RepositoryHostContext = createContext<RepositoryHost | null>(null);

/**
 * A multi-repo workspace's checkouts are hidden from the workspace list, so
 * host lookups by id miss them. They live on the workspace's own host.
 */
export function RepositoryHostProvider({
	workspaceId,
	hostId,
	hostUrl,
	children,
}: {
	workspaceId: string;
	hostId: string;
	hostUrl: string;
	children: ReactNode;
}) {
	const repositories = workspaceTrpc.workspace.repositories.useQuery(
		{ workspaceId },
		{ retry: false, staleTime: 30_000 },
	).data;
	const value = useMemo<RepositoryHost>(
		() => ({
			hostId,
			hostUrl,
			checkoutIds: new Set(
				(repositories ?? [])
					.map((repository) => repository.id)
					.filter((id) => id !== workspaceId),
			),
		}),
		[hostId, hostUrl, repositories, workspaceId],
	);
	return (
		<RepositoryHostContext.Provider value={value}>
			{children}
		</RepositoryHostContext.Provider>
	);
}

export function useRepositoryHost(): RepositoryHost | null {
	return useContext(RepositoryHostContext);
}
