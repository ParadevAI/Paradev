import { type ReactNode, useCallback, useMemo, useState } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { RepositoryChangesetSource } from "./components/RepositoryChangesetSource";
import type { RepositoryChangeset } from "./components/RepositoryChangesetSource/components/RepositoryChangesetReporter";

interface UseRepositoryChangesetsResult {
	/** Every checkout's files in repository order, each tagged with its checkout. */
	files: ChangesetFile[];
	isLoading: boolean;
	/** Render these: each one keeps a checkout's git status live. */
	sources: ReactNode;
}

export function useRepositoryChangesets(
	repositoryIds: string[],
): UseRepositoryChangesetsResult {
	const [byId, setById] = useState<Record<string, RepositoryChangeset>>({});
	const handleChange = useCallback(
		(workspaceId: string, changeset: RepositoryChangeset) =>
			setById((prev) => ({ ...prev, [workspaceId]: changeset })),
		[],
	);

	const files = useMemo(
		() => repositoryIds.flatMap((id) => byId[id]?.files ?? []),
		[repositoryIds, byId],
	);
	const isLoading = repositoryIds.some((id) => byId[id]?.isLoading ?? true);

	const sources = repositoryIds.map((id) => (
		<RepositoryChangesetSource
			key={id}
			workspaceId={id}
			onChange={handleChange}
		/>
	));

	return { files, isLoading, sources };
}
