import { type ReactNode, useCallback, useMemo, useState } from "react";
import { RepositoryReviewThreadsSource } from "./components/RepositoryReviewThreadsSource";
import type { RepositoryReviewThreads } from "./types";

interface UseRepositoryReviewThreadsResult {
	byWorkspace: ReadonlyMap<string, RepositoryReviewThreads>;
	/** Render these: each one keeps a checkout's review threads live. */
	sources: ReactNode;
}

/** Each checkout of a multi-repo workspace has its own pull request and threads. */
export function useRepositoryReviewThreads(
	repositoryIds: string[],
): UseRepositoryReviewThreadsResult {
	const [byId, setById] = useState<Record<string, RepositoryReviewThreads>>({});
	const handleChange = useCallback(
		(workspaceId: string, threads: RepositoryReviewThreads) =>
			setById((prev) => ({ ...prev, [workspaceId]: threads })),
		[],
	);
	const byWorkspace = useMemo(
		() =>
			new Map(
				repositoryIds.flatMap((id) => {
					const threads = byId[id];
					return threads ? [[id, threads] as const] : [];
				}),
			),
		[repositoryIds, byId],
	);
	const sources = repositoryIds.map((id) => (
		<RepositoryReviewThreadsSource
			key={id}
			workspaceId={id}
			onChange={handleChange}
		/>
	));
	return { byWorkspace, sources };
}
