import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	LuArchive,
	LuArchiveRestore,
	LuClock,
	LuEllipsis,
	LuLink,
	LuPlay,
	LuTrash2,
} from "react-icons/lu";
import { AutomationGroupMenuItems } from "../../../components/AutomationGroupMenuItems";
import { AutomationBreadcrumbBar } from "../AutomationBreadcrumbBar";

interface AutomationDetailHeaderProps {
	name: string;
	group: string | null;
	/** Every group in the organization, for "Move to group". */
	groups: string[];
	onMoveToGroup: (group: string | null) => void;
	onCopyLink: () => void;
	onArchive: () => void;
	onRestore: () => void;
	onDelete: () => void;
	onRunNow: () => void;
	onOpenHistory: () => void;
	archiveDisabled?: boolean;
	runNowDisabled?: boolean;
	/** Disables the actions — they're all owner-gated server-side. */
	readOnly?: boolean;
	archived?: boolean;
	/** Owner or organization owner; archiving is the one action that outlives read-only. */
	canArchive?: boolean;
}

export function AutomationDetailHeader({
	name,
	group,
	groups,
	onMoveToGroup,
	onCopyLink,
	onArchive,
	onRestore,
	onDelete,
	onRunNow,
	onOpenHistory,
	archiveDisabled,
	runNowDisabled,
	readOnly,
	archived = false,
	canArchive = !readOnly,
}: AutomationDetailHeaderProps) {
	const { t } = useLingui();
	return (
		<AutomationBreadcrumbBar name={name} group={group}>
			<Tooltip>
				{/* Disabled buttons swallow hover events, so the trigger is a
					    span — otherwise the read-only explanation never shows. */}
				<TooltipTrigger asChild>
					<span className="inline-flex">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onOpenHistory}
							disabled={readOnly || archived}
							aria-label={t({
								message: "Prompt history",
							})}
						>
							<LuClock className="size-4" />
						</Button>
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{archived ? (
						<Trans>Restore this automation to view prompt history</Trans>
					) : readOnly ? (
						<Trans>Only the owner can view prompt history</Trans>
					) : (
						<Trans>Prompt history</Trans>
					)}
				</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t({
							message: "More actions",
						})}
					>
						<LuEllipsis className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={onCopyLink}>
						<LuLink className="size-4" />
						<Trans>Copy link</Trans>
					</DropdownMenuItem>
					{!readOnly && !archived && (
						<AutomationGroupMenuItems
							kind="dropdown"
							groups={groups}
							currentGroup={group}
							onMove={onMoveToGroup}
						/>
					)}
					{archived ? (
						<DropdownMenuItem
							disabled={!canArchive || archiveDisabled}
							onSelect={onRestore}
						>
							<LuArchiveRestore className="size-4" />
							<Trans>Restore automation</Trans>
						</DropdownMenuItem>
					) : null}
					{archived ? (
						<DropdownMenuItem
							variant="destructive"
							disabled={!canArchive || archiveDisabled}
							onSelect={onDelete}
						>
							<LuTrash2 className="size-4" />
							<Trans>Delete permanently</Trans>
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							disabled={!canArchive || archiveDisabled}
							onSelect={onArchive}
						>
							<LuArchive className="size-4" />
							<Trans>Archive automation</Trans>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="mx-1 h-4 w-px bg-border" />
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex">
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 px-3"
							onClick={onRunNow}
							disabled={readOnly || archived || runNowDisabled}
						>
							<LuPlay className="size-4" />
							<span>
								<Trans>Run now</Trans>
							</span>
						</Button>
					</span>
				</TooltipTrigger>
				{archived ? (
					<TooltipContent>
						<Trans>Restore this automation to run it</Trans>
					</TooltipContent>
				) : (
					readOnly && (
						<TooltipContent>
							<Trans>Only the owner can run this automation</Trans>
						</TooltipContent>
					)
				)}
			</Tooltip>
		</AutomationBreadcrumbBar>
	);
}
