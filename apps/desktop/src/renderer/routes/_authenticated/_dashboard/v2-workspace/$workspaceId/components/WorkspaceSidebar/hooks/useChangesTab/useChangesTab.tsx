import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { LuGitCompareArrows } from "react-icons/lu";
import { useCheckoutGitStatuses } from "../../../../providers/WorkspaceGitStatusProvider";
import {
	useWorkspaceCheckouts,
	useWorkspaceFolder,
} from "../../../../state/activeRepositoryStore";
import { changesPillStats } from "../../../../utils/changesPillStats";
import type { SidebarTabDefinition } from "../../types";
import { MultiRepoChanges } from "./components/MultiRepoChanges";
import {
	type ChangesContentParams,
	useChangesContent,
} from "./hooks/useChangesContent";

export type {
	SelectDiffFile,
	SelectedDiffTarget,
} from "./hooks/useChangesContent";

/**
 * The sidebar's Changes tab: one scope row (commit filter, "vs <base>",
 * search, view-mode and fold utilities) over the sectioned changed-files list with
 * per-section diffstats, staging, hover discard, context menus, and
 * drag-to-terminal. Rows navigate the workspace's diff pane through
 * onSelectFile, and the pane's target comes back as selectedDiffTarget so the
 * list highlights what the pane is showing. A workspace with several
 * repositories shows that list once per repository, in collapsible sections,
 * following the repositories and scope picked in the Changes pane.
 */
export function useChangesTab(
	params: ChangesContentParams,
): SidebarTabDefinition {
	const { t } = useLingui();
	const checkouts = useWorkspaceCheckouts(params.workspaceId);
	const folder = useWorkspaceFolder(params.workspaceId);
	const isMultiRepo = checkouts.length > 1;
	const first = checkouts[0];
	const single = useChangesContent({
		...params,
		repositoryId: first?.repositoryId,
		worktreePath: first?.path ?? folder,
		enabled: !isMultiRepo,
	});

	const statuses = useCheckoutGitStatuses(
		isMultiRepo ? checkouts.map((checkout) => checkout.repositoryId) : [],
	);
	// A multi-repo badge counts every checkout's changes under the default scope.
	const multiRepoCount = useMemo(
		() =>
			changesPillStats(statuses.flatMap((status) => status.data ?? []))
				.fileCount,
		[statuses],
	);
	const changedPathCount = isMultiRepo
		? multiRepoCount
		: single.changedPathCount;

	return {
		id: "changes",
		label: t({ message: "Changes" }),
		icon: LuGitCompareArrows,
		badge: changedPathCount > 0 ? changedPathCount : undefined,
		content: isMultiRepo ? (
			<MultiRepoChanges {...params} checkouts={checkouts} />
		) : (
			single.content
		),
	};
}
