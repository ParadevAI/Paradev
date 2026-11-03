import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRef } from "react";
import { LuFolderInput, LuPause, LuPlay, LuTrash2, LuX } from "react-icons/lu";
import { AutomationGroupPicker } from "../AutomationGroupPicker";

interface AutomationBulkBarProps {
	count: number;
	/** Every group in the organization, sorted. */
	groups: string[];
	/** The selection's shared group; undefined when they differ. */
	currentGroup: string | null | undefined;
	canPause: boolean;
	canResume: boolean;
	busy: boolean;
	onMove: (group: string | null) => void;
	onPause: () => void;
	onResume: () => void;
	onDelete: () => void;
	onClear: () => void;
}

/** Actions for the selected automations, floating above the list. */
export function AutomationBulkBar({
	count,
	groups,
	currentGroup,
	canPause,
	canResume,
	busy,
	onMove,
	onPause,
	onResume,
	onDelete,
	onClear,
}: AutomationBulkBarProps) {
	const { t } = useLingui();
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<div
			role="toolbar"
			aria-label={t({ message: "Selected automations" })}
			className="pointer-events-auto flex h-11 items-center gap-1 rounded-xl border border-border bg-popover px-1.5 text-sm shadow-lg"
		>
			<span className="flex items-center gap-1.5 pl-2 pr-1.5 tabular-nums">
				<Trans>{count} selected</Trans>
			</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={onClear}
						aria-label={t({ message: "Clear selection" })}
						className="text-muted-foreground"
					>
						<LuX className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<Trans>Clear selection</Trans>{" "}
					<kbd className="ml-1 opacity-60">Esc</kbd>
				</TooltipContent>
			</Tooltip>
			<div className="mx-1 h-5 w-px bg-border" />
			<DropdownMenu
				onOpenChange={(open) => {
					// After the menu mounts and Radix places its own focus.
					if (open) {
						requestAnimationFrame(() =>
							requestAnimationFrame(() => inputRef.current?.focus()),
						);
					}
				}}
			>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 gap-1.5"
						disabled={busy}
					>
						<LuFolderInput className="size-4" />
						<Trans>Move to group</Trans>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="top"
					align="start"
					sideOffset={8}
					className="w-60 p-0"
				>
					<AutomationGroupPicker
						kind="dropdown"
						groups={groups}
						currentGroup={currentGroup}
						onMove={onMove}
						inputRef={inputRef}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
			{canPause && (
				<Button
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5"
					disabled={busy}
					onClick={onPause}
				>
					<LuPause className="size-4" />
					<Trans>Pause</Trans>
				</Button>
			)}
			{canResume && (
				<Button
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5"
					disabled={busy}
					onClick={onResume}
				>
					<LuPlay className="size-4" />
					<Trans>Resume</Trans>
				</Button>
			)}
			<Button
				variant="ghost"
				size="sm"
				className="h-8 gap-1.5 text-destructive hover:text-destructive"
				disabled={busy}
				onClick={onDelete}
			>
				<LuTrash2 className="size-4" />
				<Trans>Delete</Trans>
			</Button>
		</div>
	);
}
