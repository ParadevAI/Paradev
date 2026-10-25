import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuEllipsis } from "react-icons/lu";
import { useSettings } from "renderer/stores/settings";

interface DiffPaneMoreMenuProps {
	areAllFilesCollapsed: boolean;
	onToggleCollapseAll: () => void;
}

/** View options for the Changes pane, behind one button in its header. */
export function DiffPaneMoreMenu({
	areAllFilesCollapsed,
	onToggleCollapseAll,
}: DiffPaneMoreMenuProps) {
	const { t } = useLingui();
	const diffStyle = useSettings((s) => s.diffStyle);
	const showDiffComments = useSettings((s) => s.showDiffComments);
	const expandUnchanged = useSettings((s) => s.expandUnchanged);
	const updateSetting = useSettings((s) => s.update);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "More options" })}
					className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground data-[state=open]:bg-fill-hover data-[state=open]:text-foreground"
				>
					<LuEllipsis className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
					<Trans>Layout</Trans>
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={diffStyle}
					onValueChange={(next) =>
						updateSetting("diffStyle", next as typeof diffStyle)
					}
				>
					<DropdownMenuRadioItem value="unified">
						<Trans>Unified view</Trans>
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="split">
						<Trans>Split view</Trans>
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem
					checked={showDiffComments}
					onCheckedChange={(next) => updateSetting("showDiffComments", next)}
				>
					<Trans>Show review comments</Trans>
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={expandUnchanged}
					onCheckedChange={(next) => updateSetting("expandUnchanged", next)}
				>
					<Trans>Show all lines</Trans>
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={onToggleCollapseAll}>
					{areAllFilesCollapsed ? (
						<Trans>Expand all files</Trans>
					) : (
						<Trans>Collapse all files</Trans>
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
