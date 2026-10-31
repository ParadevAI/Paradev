import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { ArrowUpRight, FileText } from "lucide-react";
import type { CSSProperties } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import { PathActionsMenuItems } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/PathActionsMenuItems";
import type { FilePlace } from "../../../../../../../../utils/filePlace";
import type { DiffStats } from "../../../../../../utils/diffStats";
import type { FileChangeKind } from "../../../../../../utils/fileChange";
import { TruncateStart } from "../../../../../TruncateStart";

/**
 * One file of a turn's changes: the name stays whole while its folder gives
 * way, the stats line up with the rows around it, the row opens the file's
 * diff (or the file, when there is no diff to show) and the arrow opens the
 * file itself.
 */
export function ChangedFileRow({
	kind,
	onOpen,
	onReview,
	place,
	stats,
	statWidth,
}: {
	kind: FileChangeKind;
	place: FilePlace;
	stats: DiffStats | null;
	/** Wide enough for the card's longest count, so every row's columns align. */
	statWidth: string;
	onReview: (() => void) | undefined;
	onOpen: (() => void) | undefined;
}) {
	const { t } = useLingui();
	const shownPath = place.relativePath ?? place.absolutePath;
	const columnStyle = { width: statWidth } as CSSProperties;
	const open = kind === "deleted" ? undefined : onOpen;
	const onRowClick = onReview ?? open;
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="group/file flex min-w-0 items-center gap-1 pr-1.5 transition-colors hover:bg-foreground/[0.04]">
					<button
						className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-3 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] disabled:cursor-default"
						disabled={!onRowClick}
						onClick={onRowClick}
						title={shownPath}
						type="button"
					>
						<FileIcon className="size-3.5 shrink-0" fileName={place.name} />
						<span className="flex min-w-0 items-baseline">
							{place.directory && (
								<TruncateStart className="shrink text-muted-foreground/70 after:content-[var(--bidi-mark)]">
									{`${place.directory}/`}
								</TruncateStart>
							)}
							<span
								className={cn(
									"max-w-full shrink-0 truncate text-foreground/90",
									kind === "deleted" && "text-muted-foreground line-through",
								)}
							>
								{place.name}
							</span>
						</span>
						{kind !== "modified" && (
							<span className="shrink-0 rounded bg-foreground/[0.07] px-1 text-[10px] text-muted-foreground leading-4">
								{kind === "added"
									? t({ message: "new", context: "changed file badge" })
									: t({ message: "deleted", context: "changed file badge" })}
							</span>
						)}
						<span
							className="ml-auto flex shrink-0 font-mono text-xs tabular-nums"
							data-find-skip
						>
							<span className="text-right text-green-400" style={columnStyle}>
								{stats && stats.additions > 0 && `+${stats.additions}`}
							</span>
							<span className="text-right text-red-400" style={columnStyle}>
								{stats && stats.deletions > 0 && `−${stats.deletions}`}
							</span>
						</span>
					</button>
					<button
						aria-label={t({ message: "Open file" })}
						className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:invisible"
						disabled={!open}
						onClick={open}
						title={t({ message: "Open file" })}
						type="button"
					>
						<ArrowUpRight className="size-3.5" />
					</button>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem disabled={!open} onSelect={open}>
					<FileText />
					<Trans>Open</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<PathActionsMenuItems
					absolutePath={place.absolutePath}
					relativePath={place.relativePath ?? undefined}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);
}
