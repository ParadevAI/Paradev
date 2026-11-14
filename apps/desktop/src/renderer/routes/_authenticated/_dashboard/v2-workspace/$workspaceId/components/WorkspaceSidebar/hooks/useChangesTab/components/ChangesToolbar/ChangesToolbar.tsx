import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { FoldVertical, Search, UnfoldVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { ViewModeToggle } from "./components/ViewModeToggle";

interface ChangesToolbarProps {
	/** Left side: the scope control, or the scope in force when the list follows the pane. */
	scope: ReactNode;
	viewMode: ChangesViewMode;
	onViewModeChange: (next: ChangesViewMode) => void;
	/** Whether the last fold action was "collapse all". */
	collapsed: boolean;
	/** Toggle between collapse-all and expand-all across every section. */
	onToggleFold: () => void;
	/** Whether the file search row below the toolbar is showing. */
	searchOpen: boolean;
	/** Show/hide the file search row (hiding clears the query). */
	onToggleSearch: () => void;
}

/**
 * The panel's one control row: a scope sentence on the left — the diff
 * filter, then "vs <base>" while the scope is actually measured against the
 * base — and the search / view-mode / fold utilities right-aligned. Branch identity
 * and rename live inside the scope dropdown; counts and diffstats live on
 * the section headers. The fold action applies to every section's folder
 * groups (folders mode) or tree directories (tree mode).
 */
export function ChangesToolbar({
	scope,
	viewMode,
	onViewModeChange,
	collapsed,
	onToggleFold,
	searchOpen,
	onToggleSearch,
}: ChangesToolbarProps) {
	const { t } = useLingui();
	const label = collapsed
		? t({ message: "Expand all" })
		: t({
				message: "Collapse all",
			});
	const Icon = collapsed ? UnfoldVertical : FoldVertical;
	const searchLabel = t({
		message: "Search changed files",
	});
	return (
		<div className="flex min-w-0 items-center gap-1 overflow-hidden py-1 pr-1 pl-1.5 text-xs">
			{scope}
			<div className="ml-auto flex shrink-0 items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								"size-7 text-muted-foreground hover:text-foreground",
								searchOpen && "bg-accent text-foreground",
							)}
							onClick={onToggleSearch}
							aria-label={searchLabel}
							aria-pressed={searchOpen}
						>
							<Search className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{searchLabel}</TooltipContent>
				</Tooltip>
				<ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground"
							onClick={onToggleFold}
							aria-label={label}
						>
							<Icon className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{label}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
