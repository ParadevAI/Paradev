import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import { DiffStatText } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiffStatText";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";

interface ChangedFileRowProps
	extends Omit<ComponentProps<"button">, "children" | "className" | "type"> {
	path: string;
	/** Pre-rename path; its basename shows as "old → new". */
	oldPath?: string;
	status: string;
	additions: number | null;
	deletions: number | null;
	/** Drop the directory prefix when the row sits under a folder header. */
	hideDir?: boolean;
	isSelected?: boolean;
	/** Hide the stats on hover so actions overlaid on the row end can show. */
	hasHoverActions?: boolean;
}

function splitPath(path: string): { dir: string; basename: string } {
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash < 0) return { dir: "", basename: path };
	return {
		dir: `${path.slice(0, lastSlash)}/`,
		basename: path.slice(lastSlash + 1),
	};
}

export function ChangedFileRow({
	path,
	oldPath,
	status,
	additions,
	deletions,
	hideDir,
	isSelected,
	hasHoverActions,
	...buttonProps
}: ChangedFileRowProps) {
	const { dir: fullDir, basename } = splitPath(path);
	const dir = hideDir ? "" : fullDir;
	const oldBasename = oldPath ? splitPath(oldPath).basename : null;
	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-1.5 py-1 pr-3 pl-3 text-left text-xs hover:bg-accent/50",
				isSelected && "bg-accent/70",
			)}
			{...buttonProps}
		>
			<FileIcon fileName={basename} className="size-3.5 shrink-0" />
			<span className="flex min-w-0 flex-1 items-baseline overflow-hidden">
				{dir && <span className="truncate text-muted-foreground">{dir}</span>}
				{oldBasename && (
					<span className="truncate text-muted-foreground">
						{oldBasename}
						<span className="px-1">→</span>
					</span>
				)}
				<span className="min-w-[120px] truncate font-medium text-foreground">
					{basename}
				</span>
			</span>
			<span
				className={cn(
					"ml-auto flex shrink-0 items-center gap-1.5",
					hasHoverActions &&
						"group-hover:invisible group-has-[[data-state=open]]:invisible",
				)}
			>
				{((additions ?? 0) > 0 || (deletions ?? 0) > 0) && (
					<span className="text-[10px] text-muted-foreground">
						<DiffStatText additions={additions} deletions={deletions} />
					</span>
				)}
				<StatusIndicator status={status} />
			</span>
		</button>
	);
}
