import { useDroppable } from "@dnd-kit/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { TableCell, TableRow } from "@superset/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuChevronRight, LuPlus, LuTrash2 } from "react-icons/lu";

interface AutomationGroupHeaderRowProps {
	/** Null is the section of automations in no group. */
	group: string | null;
	count: number;
	collapsed: boolean;
	columnCount: number;
	onToggle: () => void;
	/** Creates an automation already in this group; omitted hides the button. */
	onCreate?: () => void;
	isCreating?: boolean;
	/** ⌘-click selects the section's rows; omitted when rows can't be selected. */
	onSelectAll?: () => void;
	/** Accepts dragged automations; omitted when the table can't be dragged. */
	drop?: { active: boolean };
	/** Right-click "Delete group"; omitted where the rows can't be regrouped. */
	onDeleteGroup?: () => void;
}

export function AutomationGroupHeaderRow({
	group,
	count,
	collapsed,
	columnCount,
	onToggle,
	onCreate,
	isCreating,
	onSelectAll,
	drop,
	onDeleteGroup,
}: AutomationGroupHeaderRowProps) {
	const { t } = useLingui();
	const { setNodeRef } = useDroppable({
		id: `group:${group ?? ""}`,
		data: { group },
		disabled: !drop,
	});
	const row = (
		<TableRow
			ref={setNodeRef}
			data-drop-active={drop?.active || undefined}
			className="group/header h-8 border-border/50 bg-muted/40 transition-colors hover:bg-muted/60 data-[drop-active]:bg-accent"
		>
			<TableCell colSpan={columnCount} className="p-0">
				<div className="flex h-8 items-center pr-4">
					<button
						type="button"
						onMouseDown={(event) => {
							if (onSelectAll && event.shiftKey) event.preventDefault();
						}}
						onClick={(event) => {
							if (
								onSelectAll &&
								(event.metaKey || event.ctrlKey || event.shiftKey)
							) {
								onSelectAll();
								return;
							}
							onToggle();
						}}
						aria-expanded={!collapsed}
						aria-label={
							collapsed
								? t({ message: "Expand group" })
								: t({ message: "Collapse group" })
						}
						className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
					>
						<LuChevronRight
							className={cn(
								"size-3 shrink-0 text-muted-foreground transition-transform",
								!collapsed && "rotate-90",
							)}
						/>
						<span className="min-w-0 truncate font-medium text-foreground">
							{group ?? <Trans>No group</Trans>}
						</span>
						<span className="tabular-nums text-muted-foreground">{count}</span>
					</button>
					{onCreate && group && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									disabled={isCreating}
									onClick={onCreate}
									aria-label={t({ message: `New automation in ${group}` })}
									className="size-6 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/header:opacity-100"
								>
									<LuPlus className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<Trans>New automation in {group}</Trans>
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</TableCell>
		</TableRow>
	);

	if (!onDeleteGroup || group === null) return row;
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem variant="destructive" onSelect={onDeleteGroup}>
					<LuTrash2 className="size-4" />
					<Trans>Delete group…</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
