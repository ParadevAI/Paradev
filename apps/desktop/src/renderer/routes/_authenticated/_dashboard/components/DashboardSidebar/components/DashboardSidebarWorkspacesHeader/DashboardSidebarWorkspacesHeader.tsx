import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef } from "react";
import { VscFolderOpened, VscNewFolder } from "react-icons/vsc";
import { AddProjectMenuItems } from "renderer/routes/_authenticated/_dashboard/components/AddProjectMenuItems";
import type {
	SidebarProjectHostFilter,
	SidebarProjectSortMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { DashboardSidebarProjectsFilterInput } from "./components/DashboardSidebarProjectsFilterInput";
import { DashboardSidebarProjectsSortMenu } from "./components/DashboardSidebarProjectsSortMenu";
import { useProjectFilterExpanded } from "./hooks/useProjectFilterExpanded";

interface DashboardSidebarWorkspacesHeaderProps {
	sortMode: SidebarProjectSortMode;
	onSortModeChange: (mode: SidebarProjectSortMode) => void;
	/** Null hides the host filter (cloud rows are not inline). */
	hostFilter: SidebarProjectHostFilter | null;
	onHostFilterChange: (filter: SidebarProjectHostFilter) => void;
	filterQuery: string;
	onFilterQueryChange: (query: string) => void;
}

export function DashboardSidebarWorkspacesHeader({
	sortMode,
	onSortModeChange,
	hostFilter,
	onHostFilterChange,
	filterQuery,
	onFilterQueryChange,
}: DashboardSidebarWorkspacesHeaderProps) {
	const { t } = useLingui();
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.workspaces,
	);
	const toggleSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.toggle,
	);
	// The query lives in DashboardSidebar (it clears it when the sidebar
	// collapses to the icon rail); only the open/closed flag is local, and
	// the hook keeps the input open whenever a query is active because this
	// header unmounts under the bulk-selection toolbar.
	const [isFilterExpanded, setIsFilterExpanded] =
		useProjectFilterExpanded(filterQuery);
	const handleFilterExpandedChange = (expanded: boolean) => {
		setIsFilterExpanded(expanded);
		// Filtering a hidden list is useless — reveal it when the search opens.
		if (expanded && isSectionCollapsed) toggleSectionCollapsed("workspaces");
	};
	// The converse: collapsing the section while the input is open would leave
	// a filter running against a hidden list (and no chevron to say the rows
	// are merely collapsed), so a collapse closes the filter.
	const wasSectionCollapsedRef = useRef(isSectionCollapsed);
	useEffect(() => {
		if (isSectionCollapsed && !wasSectionCollapsedRef.current) {
			onFilterQueryChange("");
			setIsFilterExpanded(false);
		}
		wasSectionCollapsedRef.current = isSectionCollapsed;
	}, [isSectionCollapsed, onFilterQueryChange, setIsFilterExpanded]);
	return (
		<DashboardSidebarSectionHeader
			label={t({
				message: "Projects",
			})}
			section="workspaces"
			labelHidden={isFilterExpanded}
		>
			<DashboardSidebarProjectsFilterInput
				query={filterQuery}
				onQueryChange={onFilterQueryChange}
				isExpanded={isFilterExpanded}
				onExpandedChange={handleFilterExpandedChange}
			/>
			<DashboardSidebarProjectsSortMenu
				sortMode={sortMode}
				onSortModeChange={onSortModeChange}
				hostFilter={hostFilter}
				onHostFilterChange={onHostFilterChange}
			/>
			<DropdownMenu>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({
									message: "Add project",
								})}
								onClick={(event) => event.stopPropagation()}
								onKeyDown={(event) => event.stopPropagation()}
								className="group/addrepo flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								<VscNewFolder className="size-3.5 group-hover/addrepo:hidden" />
								<VscFolderOpened className="hidden size-3.5 group-hover/addrepo:block" />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Add project</Trans>
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent
					align="end"
					onCloseAutoFocus={(event) => event.preventDefault()}
					// The content portals to body but React events still bubble up the
					// component tree — without these, selecting an item triggers the
					// header row's collapse toggle.
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<AddProjectMenuItems />
				</DropdownMenuContent>
			</DropdownMenu>
		</DashboardSidebarSectionHeader>
	);
}
