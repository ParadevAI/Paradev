import { useMemo } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useChangesRepositoryPicker } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangesRepositoryPicker";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useRepositoryChangesets } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryChangesets";
import { useCheckoutGitStatuses } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import type { WorkspaceCheckout } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/activeRepositoryStore";
import { useChangesFilter } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/repositoryChangesFilterStore";
import { changesFilterLabel } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/changesFilterLabel";
import type { ChangesContentParams } from "../../hooks/useChangesContent";
import { ChangesTabContent } from "../ChangesTabContent";
import { RepositoryChangesSection } from "./components/RepositoryChangesSection";
import { changedPathCountByRepository } from "./utils/changedPathCountByRepository";
import { everyStatusFailed } from "./utils/everyStatusFailed";

const FAILED_STATUS = { data: undefined, isLoading: false };

interface MultiRepoChangesProps extends ChangesContentParams {
	checkouts: WorkspaceCheckout[];
}

/**
 * The changes of a multi-repo workspace, one collapsible section per
 * repository under one search, view mode and fold header. It shows the
 * repositories and the scope picked in the Changes pane header.
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
	const picker = useChangesRepositoryPicker(workspaceId);
	const shownCheckouts = useMemo(
		() =>
			checkouts.filter((checkout) => picker.shown.has(checkout.repositoryId)),
		[checkouts, picker.shown],
	);
	const repositoryIds = useMemo(
		() => shownCheckouts.map((checkout) => checkout.repositoryId),
		[shownCheckouts],
	);
	const changesets = useRepositoryChangesets(workspaceId, repositoryIds);
	const statuses = useCheckoutGitStatuses(repositoryIds);
	const failedRepositories = useMemo(
		() =>
			shownCheckouts.filter((checkout) =>
				changesets.failedRepositoryIds.includes(checkout.repositoryId),
			),
		[shownCheckouts, changesets.failedRepositoryIds],
	);
	const sectionCheckouts = useMemo(
		() =>
			shownCheckouts.filter(
				(checkout) =>
					!changesets.failedRepositoryIds.includes(checkout.repositoryId),
			),
		[shownCheckouts, changesets.failedRepositoryIds],
	);
	const changedPathCounts = useMemo(
		() => changedPathCountByRepository(changesets.files),
		[changesets.files],
	);
	const onlyFilter = useChangesFilter(workspaceId, repositoryIds[0]);
	const scopeLabel = changesFilterLabel(
		repositoryIds.length === 1 ? onlyFilter : { kind: picker.scopeKind },
		[],
	);

	return (
		<>
			{changesets.sources}
			<ChangesTabContent
				workspaceId={workspaceId}
				repositoryId={undefined}
				status={everyStatusFailed(statuses) ? FAILED_STATUS : undefined}
				scope={
					<span className="truncate px-1.5 text-muted-foreground">
						{scopeLabel}
					</span>
				}
				viewMode={preferences.changesViewMode}
				files={changesets.files}
				isLoading={changesets.isLoading}
				failedRepositories={failedRepositories}
				onViewModeChange={setChangesViewMode}
				compact={compact}
				renderList={({ files, isFiltered, foldSignal }) => (
					<div className="min-h-0 flex-1 overflow-y-auto">
						{sectionCheckouts.map((checkout) => {
							const changedPathCount =
								changedPathCounts.get(checkout.repositoryId) ?? 0;
							return (
								<RepositoryChangesSection
									key={checkout.repositoryId}
									workspaceId={workspaceId}
									checkout={checkout}
									visibleFiles={files}
									changedPathCount={changedPathCount}
									isLoading={
										changedPathCount === 0 &&
										changesets.isRepositoryLoading(checkout.repositoryId)
									}
									isFiltered={isFiltered}
									viewMode={preferences.changesViewMode}
									foldSignal={foldSignal}
									selectedDiffTarget={selectedDiffTarget}
									onSelectFile={onSelectFile}
									onOpenFile={onOpenFile}
									onOpenInEditor={openInExternalEditor}
								/>
							);
						})}
					</div>
				)}
			/>
		</>
	);
}
