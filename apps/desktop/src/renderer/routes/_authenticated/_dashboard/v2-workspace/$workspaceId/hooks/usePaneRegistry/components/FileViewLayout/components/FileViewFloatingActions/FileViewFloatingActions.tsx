import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuSearch } from "react-icons/lu";
import { FileOpenInButton } from "../../../FileOpenInButton";
import { FileTreeToggle } from "../../../FileTreeToggle";

interface FileViewFloatingActionsProps {
	workspaceId: string;
	filePath?: string;
	onSearch?: () => void;
}

/** The tree row's file actions, floating where the tree was while it is hidden. */
export function FileViewFloatingActions({
	workspaceId,
	filePath,
	onSearch,
}: FileViewFloatingActionsProps) {
	const { t } = useLingui();
	const searchLabel = t({ message: "Search files" });
	return (
		<div className="absolute top-2 right-2 z-10 flex h-7 items-center gap-1 rounded-full border border-border/60 bg-background px-1 shadow-sm">
			{filePath && (
				<FileOpenInButton workspaceId={workspaceId} filePath={filePath} />
			)}
			{onSearch && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={searchLabel}
							onClick={onSearch}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						>
							<LuSearch className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{searchLabel}</TooltipContent>
				</Tooltip>
			)}
			<FileTreeToggle />
		</div>
	);
}
