import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ListFilter } from "lucide-react";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

interface ChangesListOptionsMenuProps {
	viewMode: ChangesViewMode;
	onViewModeChange: (next: ChangesViewMode) => void;
	/** Whether the last fold action was "collapse all". */
	collapsed: boolean;
	onToggleFold: () => void;
}

/** The compact list's view menu: folders vs tree, and fold every group. */
export function ChangesListOptionsMenu({
	viewMode,
	onViewModeChange,
	collapsed,
	onToggleFold,
}: ChangesListOptionsMenuProps) {
	const { t } = useLingui();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
					aria-label={t({ message: "Options" })}
				>
					<ListFilter className="size-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuRadioGroup
					value={viewMode}
					onValueChange={(next) => onViewModeChange(next as ChangesViewMode)}
				>
					<DropdownMenuRadioItem value="folders">
						<Trans>Folder view</Trans>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="tree">
						<Trans>Tree view</Trans>
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={onToggleFold}>
					{collapsed ? <Trans>Expand all</Trans> : <Trans>Collapse all</Trans>}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
