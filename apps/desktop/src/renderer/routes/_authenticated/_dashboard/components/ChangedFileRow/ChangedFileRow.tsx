import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import type { FileStatus } from "renderer/lib/pierreTree";
import { splitPath } from "renderer/lib/splitPath";
import { DiffStatText } from "renderer/routes/_authenticated/_dashboard/components/DiffStatText";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/components/StatusIndicator";
import { renameSourceLabel } from "./utils/renameSourceLabel";

interface ChangedFileRowProps
	extends Omit<ComponentProps<"button">, "children" | "className" | "type"> {
	path: string;
	oldPath?: string;
	status: FileStatus;
	additions: number | null;
	deletions: number | null;
	hideDir?: boolean;
	isSelected?: boolean;
	hideStatsOnHover?: boolean;
}

export function ChangedFileRow({
	path,
	oldPath,
	status,
	additions,
	deletions,
	hideDir,
	isSelected,
	hideStatsOnHover,
	...buttonProps
}: ChangedFileRowProps) {
	const { t } = useLingui();
	const { dir, name } = splitPath(path);
	const oldLabel = oldPath
		? renameSourceLabel(path, oldPath) || t({ message: "./" })
		: null;
	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-1.5 py-1 pr-3 pl-3 text-left text-xs hover:bg-accent/50",
				isSelected && "bg-accent/70",
			)}
			{...buttonProps}
		>
			<FileIcon fileName={name} className="size-3.5 shrink-0" />
			{/* The name never shrinks before the folder text; it truncates only when
			    it alone is wider than the row, keeping room for the rename hint. */}
			<span className="flex min-w-0 flex-1 items-baseline overflow-hidden">
				{dir && !hideDir && (
					<span className="truncate text-muted-foreground">{dir}</span>
				)}
				{oldLabel && (
					<>
						<span className="min-w-8 truncate text-muted-foreground" dir="rtl">
							<span dir="ltr">{oldLabel}</span>
						</span>
						<span className="shrink-0 px-1 text-muted-foreground">→</span>
					</>
				)}
				<span
					className={cn(
						"shrink-0 truncate font-medium text-foreground",
						oldLabel ? "max-w-[calc(100%-3.25rem)]" : "max-w-full",
					)}
				>
					{name}
				</span>
			</span>
			<span
				className={cn(
					"ml-auto flex shrink-0 items-center gap-1.5",
					hideStatsOnHover &&
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
