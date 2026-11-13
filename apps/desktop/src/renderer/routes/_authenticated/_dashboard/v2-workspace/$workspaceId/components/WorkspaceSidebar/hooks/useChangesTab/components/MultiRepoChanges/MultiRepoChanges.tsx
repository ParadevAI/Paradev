import { useMemo, useState } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { ChangesListHeader } from "renderer/routes/_authenticated/_dashboard/components/ChangesListHeader";
import { useFoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import type { WorkspaceCheckout } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/activeRepositoryStore";
import type { ChangesContentParams } from "../../hooks/useChangesContent";
import { RepositoryChangesSection } from "./components/RepositoryChangesSection";

interface MultiRepoChangesProps extends Omit<ChangesContentParams, "shared"> {
	checkouts: WorkspaceCheckout[];
}

/** Each checkout's changes in its own section, under one search and fold. */
export function MultiRepoChanges({
	checkouts,
	...params
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
				{checkouts.map((checkout) => (
					<RepositoryChangesSection
						key={checkout.repositoryId}
						{...params}
						checkout={checkout}
						shared={shared}
					/>
				))}
			</div>
		</div>
	);
}
