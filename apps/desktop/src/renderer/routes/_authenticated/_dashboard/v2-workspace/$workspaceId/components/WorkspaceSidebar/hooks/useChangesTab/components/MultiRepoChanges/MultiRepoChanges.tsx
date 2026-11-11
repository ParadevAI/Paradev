import { useMemo, useState } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { ChangesListHeader } from "renderer/routes/_authenticated/_dashboard/components/ChangesListHeader";
import { useFoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import type { ChangesContentParams } from "../../hooks/useChangesContent";
import { RepositoryChangesSection } from "./components/RepositoryChangesSection";

interface Repository {
	id: string;
	name: string;
	branch: string;
}

interface MultiRepoChangesProps
	extends Omit<ChangesContentParams, "workspaceId" | "shared"> {
	repositories: Repository[];
	/** Opening a file in a pane needs its checkout active first. */
	onSelectRepository: (repositoryId: string) => void;
	onCountChange: (repositoryId: string, count: number) => void;
}

export function MultiRepoChanges({
	repositories,
	onSelectRepository,
	onCountChange,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	compact,
}: MultiRepoChangesProps) {
	const [query, setQuery] = useState("");
	const { foldSignal, collapsed, toggleFold } = useFoldSignal();
	const { preferences, setChangesViewMode } = useV2UserPreferences();
	const shared = useMemo(() => ({ query, foldSignal }), [query, foldSignal]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ChangesListHeader
				query={query}
				onQueryChange={setQuery}
				viewMode={preferences.changesViewMode}
				onViewModeChange={setChangesViewMode}
				collapsed={collapsed}
				onToggleFold={toggleFold}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{repositories.map((repository) => (
					<RepositoryChangesSection
						key={repository.id}
						repository={repository}
						selectedDiffTarget={selectedDiffTarget}
						onSelectFile={onSelectFile}
						onOpenFile={
							onOpenFile &&
							((absolutePath, openInNewTab) => {
								onSelectRepository(repository.id);
								onOpenFile(absolutePath, openInNewTab);
							})
						}
						onCountChange={onCountChange}
						compact={compact}
						tagWorkspace
						shared={shared}
					/>
				))}
			</div>
		</div>
	);
}
