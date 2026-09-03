import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiOutlineBarsArrowDown } from "react-icons/hi2";
import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const SORT_MODES: SidebarProjectSortMode[] = ["manual", "active", "created"];

interface DashboardSidebarProjectsSortMenuProps {
	sortMode: SidebarProjectSortMode;
	onSortModeChange: (mode: SidebarProjectSortMode) => void;
}

/**
 * Sort-mode picker in the Projects header. Lives inside the header strip,
 * which toggles the section on click, so the trigger and the (portaled, but
 * React-bubbling) menu content both stop propagation.
 */
export function DashboardSidebarProjectsSortMenu({
	sortMode,
	onSortModeChange,
}: DashboardSidebarProjectsSortMenuProps) {
	const { t } = useLingui();
	const labels: Record<SidebarProjectSortMode, string> = {
		manual: t({
			id: "dashboard.sidebar.workspacesHeader.sortManual",
			message: "Manual order",
		}),
		active: t({
			id: "dashboard.sidebar.workspacesHeader.sortLastActive",
			message: "Last active",
		}),
		created: t({
			id: "dashboard.sidebar.workspacesHeader.sortDateCreated",
			message: "Date created",
		}),
	};
	const currentLabel = labels[sortMode];

	return (
		<DropdownMenu>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({
								id: "dashboard.sidebar.workspacesHeader.sortProjectsAriaLabel",
								message: "Sort projects",
							})}
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
							className={cn(
								"flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-fill-hover hover:text-foreground",
								// Read as "on" whenever the list is not in drag order.
								sortMode === "manual"
									? "text-muted-foreground"
									: "text-foreground",
							)}
						>
							<HiOutlineBarsArrowDown className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{t({
						id: "dashboard.sidebar.workspacesHeader.sortProjects",
						message: `Sort projects (${currentLabel})`,
					})}
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				onCloseAutoFocus={(event) => event.preventDefault()}
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground/70">
					{t({
						id: "dashboard.sidebar.workspacesHeader.sortBy",
						message: "Sort by",
					})}
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={sortMode}
					onValueChange={(value) =>
						onSortModeChange(value as SidebarProjectSortMode)
					}
				>
					{SORT_MODES.map((mode) => (
						<DropdownMenuRadioItem key={mode} value={mode}>
							{labels[mode]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				{sortMode !== "manual" && (
					<div className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground/70">
						{t({
							id: "dashboard.sidebar.workspacesHeader.sortDragHint",
							message: "Drag to reorder in Manual order",
						})}
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
