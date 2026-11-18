import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { ChangesSearchInput } from "../ChangesSearchInput";
import { ChangesListOptionsMenu } from "./components/ChangesListOptionsMenu";

interface ChangesListHeaderProps {
	query: string;
	onQueryChange: (query: string) => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (next: ChangesViewMode) => void;
	/** Whether the last fold action was "collapse all". */
	collapsed: boolean;
	onToggleFold: () => void;
}

export function ChangesListHeader({
	query,
	onQueryChange,
	viewMode,
	onViewModeChange,
	collapsed,
	onToggleFold,
}: ChangesListHeaderProps) {
	return (
		<div className="flex items-center gap-1 pt-1 pr-1.5">
			<div className="min-w-0 flex-1 [&>div]:mr-0">
				<ChangesSearchInput
					query={query}
					onQueryChange={onQueryChange}
					onClose={() => onQueryChange("")}
					autoFocus={false}
				/>
			</div>
			<div className="mt-1">
				<ChangesListOptionsMenu
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
					collapsed={collapsed}
					onToggleFold={onToggleFold}
				/>
			</div>
		</div>
	);
}
