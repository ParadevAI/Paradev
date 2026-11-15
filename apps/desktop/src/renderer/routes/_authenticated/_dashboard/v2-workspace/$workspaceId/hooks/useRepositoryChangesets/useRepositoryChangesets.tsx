import { type ReactNode, useCallback, useMemo, useState } from "react";
import type {
	ChangesetFile,
	DiffRef,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import {
	type RepositoryChangeset,
	RepositoryChangesetSource,
} from "./components/RepositoryChangesetSource";
import { failedRepositoryIdsOf } from "./utils/failedRepositoryIdsOf";

interface UseRepositoryChangesetsResult {
	/** Every checkout's files in repository order, each tagged with its checkout. */
	files: ChangesetFile[];
	isLoading: boolean;
	isRepositoryLoading: (repositoryId: string) => boolean;
	/** The checkouts whose files failed to load, in repository order. */
	failedRepositoryIds: string[];
	/** Each checkout's diff scope, once its source has reported it. */
	refByRepositoryId: Record<string, DiffRef | undefined>;
	/** Render these: each one keeps a checkout's git status live. */
	sources: ReactNode;
}

export function useRepositoryChangesets(
	workspaceId: string,
	repositoryIds: string[],
): UseRepositoryChangesetsResult {
	const [byId, setById] = useState<Record<string, RepositoryChangeset>>({});
	const handleChange = useCallback(
		(repositoryId: string, changeset: RepositoryChangeset) =>
			setById((prev) => ({ ...prev, [repositoryId]: changeset })),
		[],
	);

	const files = useMemo(
		() => repositoryIds.flatMap((id) => byId[id]?.files ?? []),
		[repositoryIds, byId],
	);
	const isRepositoryLoading = useCallback(
		(id: string) => byId[id]?.isLoading ?? true,
		[byId],
	);
	const isLoading = repositoryIds.some(isRepositoryLoading);
	const failedRepositoryIds = useMemo(
		() => failedRepositoryIdsOf(repositoryIds, byId),
		[repositoryIds, byId],
	);

	const refByRepositoryId = useMemo(
		() => Object.fromEntries(repositoryIds.map((id) => [id, byId[id]?.ref])),
		[repositoryIds, byId],
	);

	const sources = repositoryIds.map((id) => (
		<RepositoryChangesetSource
			key={id}
			workspaceId={workspaceId}
			repositoryId={id}
			onChange={handleChange}
		/>
	));

	return {
		files,
		isLoading,
		isRepositoryLoading,
		failedRepositoryIds,
		refByRepositoryId,
		sources,
	};
}
