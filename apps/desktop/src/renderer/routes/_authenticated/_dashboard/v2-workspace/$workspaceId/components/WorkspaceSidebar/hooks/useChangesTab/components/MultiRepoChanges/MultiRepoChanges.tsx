import { useMemo } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useChangesRepositoryPicker } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangesRepositoryPicker";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useRepositoryChangesets } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryChangesets";
import {
	useWorkspaceFolder,
	type WorkspaceCheckout,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/activeRepositoryStore";
import { useChangesFilter } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/repositoryChangesFilterStore";
import { changesFilterLabel } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/changesFilterLabel";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangesContentParams } from "../../hooks/useChangesContent";
import type { RepositoryRoot } from "../ChangesFileList/utils/repositoryTree";
import { ChangesTabContent } from "../ChangesTabContent";

interface MultiRepoChangesProps extends ChangesContentParams {
	checkouts: WorkspaceCheckout[];
}

/**
 * The changes of a multi-repo workspace as one list, each repository a
 * top-level folder. It shows the repositories and the scope picked in the
 * Changes pane header.
 */
export function MultiRepoChanges({
	checkouts,
	workspaceId,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	compact = false,
}: MultiRepoChangesProps) {
	const { preferences, setChangesViewMode } = useV2UserPreferences();
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const folder = useWorkspaceFolder(workspaceId);
	const picker = useChangesRepositoryPicker(workspaceId);
	const repositories = useMemo<RepositoryRoot[]>(
		() =>
			checkouts
				.filter((checkout) => picker.shown.has(checkout.repositoryId))
				.map(({ repositoryId, name, path }) => ({ repositoryId, name, path })),
		[checkouts, picker.shown],
	);
	const repositoryIds = useMemo(
		() => repositories.map((repository) => repository.repositoryId),
		[repositories],
	);
	const changesets = useRepositoryChangesets(workspaceId, repositoryIds);
	const onlyFilter = useChangesFilter(workspaceId, repositoryIds[0]);
	const scopeLabel = changesFilterLabel(
		repositoryIds.length === 1 ? onlyFilter : { kind: picker.scopeKind },
		[],
	);

	const selectedCheckout = repositories.find(
		(repository) =>
			repository.repositoryId === selectedDiffTarget?.repositoryId,
	);
	const selectedFilePath =
		selectedDiffTarget && selectedCheckout
			? toAbsoluteWorkspacePath(selectedCheckout.path, selectedDiffTarget.path)
			: undefined;

	return (
		<>
			{changesets.sources}
			<ChangesTabContent
				workspaceId={workspaceId}
				repositoryId={undefined}
				scope={
					<span className="truncate px-1.5 text-muted-foreground">
						{scopeLabel}
					</span>
				}
				viewMode={preferences.changesViewMode}
				files={changesets.files}
				isLoading={changesets.isLoading && changesets.files.length === 0}
				worktreePath={folder}
				repositories={repositories}
				selectedFilePath={selectedFilePath}
				selectedChangeKey={
					selectedCheckout ? selectedDiffTarget?.changeKey : undefined
				}
				onSelectFile={onSelectFile}
				onOpenFile={onOpenFile}
				onOpenInEditor={openInExternalEditor}
				onViewModeChange={setChangesViewMode}
				compact={compact}
			/>
		</>
	);
}
