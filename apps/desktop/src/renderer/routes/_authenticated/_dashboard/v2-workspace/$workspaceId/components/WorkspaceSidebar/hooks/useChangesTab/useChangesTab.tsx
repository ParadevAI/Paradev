import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { LuGitCompareArrows } from "react-icons/lu";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	hasCheckouts,
	useSelectRepository,
	useWorkspaceRepositories,
} from "../../../../state/activeRepositoryStore";
import type { SidebarTabDefinition } from "../../types";
import { MultiRepoChanges } from "./components/MultiRepoChanges";
import {
	type ChangesContentParams,
	useChangesContent,
} from "./hooks/useChangesContent";

export type { SelectedDiffTarget } from "./hooks/useChangesContent";

/**
 * The sidebar's Changes tab: one scope row (commit filter, "vs <base>",
 * search, view-mode and fold utilities) over the sectioned changed-files list with
 * per-section diffstats, staging, hover discard, context menus, and
 * drag-to-terminal. Rows navigate the workspace's diff pane through
 * onSelectFile, and the pane's target comes back as selectedDiffTarget so the
 * list highlights what the pane is showing. A workspace with several
 * repositories shows that view once per repository, in collapsible sections.
 */
export function useChangesTab(
	params: ChangesContentParams,
): SidebarTabDefinition {
	const { t } = useLingui();
	const single = useChangesContent(params);

	const groupId = useWorkspace().workspace.id;
	const repositories = useWorkspaceRepositories(groupId);
	const selectRepository = useSelectRepository();
	const [counts, setCounts] = useState<Record<string, number>>({});
	const handleCountChange = useCallback(
		(repositoryId: string, count: number) =>
			setCounts((prev) =>
				prev[repositoryId] === count
					? prev
					: { ...prev, [repositoryId]: count },
			),
		[],
	);

	const isMultiRepo = hasCheckouts(groupId, repositories);
	const changedPathCount = isMultiRepo
		? repositories.reduce(
				(sum, repository) => sum + (counts[repository.id] ?? 0),
				0,
			)
		: single.changedPathCount;

	return {
		id: "changes",
		label: t({ message: "Changes" }),
		icon: LuGitCompareArrows,
		badge: changedPathCount > 0 ? changedPathCount : undefined,
		content: isMultiRepo ? (
			<MultiRepoChanges
				{...params}
				repositories={repositories}
				onSelectRepository={(repositoryId) =>
					selectRepository(groupId, repositoryId)
				}
				onCountChange={handleCountChange}
			/>
		) : (
			single.content
		),
	};
}
