import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { FileIcon } from "renderer/lib/fileIcons";

interface DirectoryRowsProps {
	workspaceId: string;
	directory: string;
	depth: number;
	initiallyExpanded: readonly string[];
	currentFilePath: string;
	onOpenFile: (absolutePath: string) => void;
}

export function DirectoryRows({
	workspaceId,
	directory,
	depth,
	initiallyExpanded,
	currentFilePath,
	onOpenFile,
}: DirectoryRowsProps) {
	const listing = workspaceTrpc.filesystem.listDirectory.useQuery({
		workspaceId,
		absolutePath: directory,
	});
	const [expanded, setExpanded] = useState(() => new Set(initiallyExpanded));
	const entries = [...(listing.data?.entries ?? [])].sort((a, b) => {
		const aIsDirectory = a.kind === "directory";
		if (aIsDirectory !== (b.kind === "directory")) return aIsDirectory ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	const revealCurrent = useCallback(
		(row: HTMLButtonElement | null) => row?.scrollIntoView({ block: "center" }),
		[],
	);
	const indent = { paddingLeft: `${depth * 12 + 6}px` };
	return entries.map((entry) => {
		if (entry.kind === "directory") {
			const isOpen = expanded.has(entry.absolutePath);
			return (
				<div key={entry.absolutePath}>
					<button
						type="button"
						style={indent}
						onClick={() =>
							setExpanded((current) => {
								const next = new Set(current);
								if (isOpen) next.delete(entry.absolutePath);
								else next.add(entry.absolutePath);
								return next;
							})
						}
						className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm pr-2 text-left text-xs hover:bg-accent"
					>
						{isOpen ? (
							<LuChevronDown className="size-3 shrink-0 text-muted-foreground" />
						) : (
							<LuChevronRight className="size-3 shrink-0 text-muted-foreground" />
						)}
						<span className="truncate">{entry.name}</span>
					</button>
					{isOpen && (
						<DirectoryRows
							workspaceId={workspaceId}
							directory={entry.absolutePath}
							depth={depth + 1}
							initiallyExpanded={initiallyExpanded}
							currentFilePath={currentFilePath}
							onOpenFile={onOpenFile}
						/>
					)}
				</div>
			);
		}
		return (
			<button
				key={entry.absolutePath}
				ref={entry.absolutePath === currentFilePath ? revealCurrent : undefined}
				type="button"
				style={indent}
				onClick={() => onOpenFile(entry.absolutePath)}
				className={cn(
					"flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm pr-2 text-left text-xs hover:bg-accent",
					entry.absolutePath === currentFilePath && "bg-accent",
				)}
			>
				<FileIcon
					fileName={entry.name}
					className="ml-[18px] size-3.5 shrink-0"
				/>
				<span className="truncate">{entry.name}</span>
			</button>
		);
	});
}
