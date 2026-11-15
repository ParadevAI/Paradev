import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { LuChevronRight, LuFolderGit2 } from "react-icons/lu";
import type { FoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type { WorkspaceCheckout } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/activeRepositoryStore";
import type { ChangesViewMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type {
	SelectDiffFile,
	SelectedDiffTarget,
} from "../../../../hooks/useChangesContent";
import { ChangesFileList } from "../../../ChangesFileList";

interface RepositoryChangesSectionProps {
	workspaceId: string;
	checkout: WorkspaceCheckout;
	/** Every shown repository's files that match the search. */
	visibleFiles: ChangesetFile[];
	/** Every changed path of the repository, search or not. */
	changedPathCount: number;
	isLoading: boolean;
	isFiltered: boolean;
	viewMode: ChangesViewMode;
	foldSignal: FoldSignal;
	selectedDiffTarget?: SelectedDiffTarget;
	onSelectFile?: SelectDiffFile;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (absolutePath: string) => void;
}

/** One repository's changes under a collapsible header, open while it has changes. */
export function RepositoryChangesSection({
	workspaceId,
	checkout,
	visibleFiles,
	changedPathCount,
	isLoading,
	isFiltered,
	viewMode,
	foldSignal,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: RepositoryChangesSectionProps) {
	const files = useMemo(
		() =>
			visibleFiles.filter(
				(file) => file.repositoryId === checkout.repositoryId,
			),
		[visibleFiles, checkout.repositoryId],
	);
	const [userOpen, setUserOpen] = useState<boolean | null>(null);
	const open = userOpen ?? changedPathCount > 0;
	const isTarget = selectedDiffTarget?.repositoryId === checkout.repositoryId;

	return (
		<Collapsible
			open={open}
			onOpenChange={setUserOpen}
			className="flex shrink-0 flex-col border-b border-border last:border-b-0"
		>
			<CollapsibleTrigger className="sticky top-0 z-10 flex h-8 w-full items-center gap-1.5 bg-background px-2 text-left text-xs hover:bg-accent/50">
				<LuChevronRight
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-90",
					)}
				/>
				<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="truncate font-medium">{checkout.name}</span>
				<span className="min-w-0 flex-1 truncate text-muted-foreground">
					{checkout.branch}
				</span>
				{changedPathCount > 0 && (
					<span className="shrink-0 tabular-nums text-muted-foreground">
						{changedPathCount}
					</span>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col pb-1">
				<ChangesFileList
					files={files}
					isFiltered={isFiltered}
					workspaceId={workspaceId}
					repositoryId={checkout.repositoryId}
					repositoryName={checkout.name}
					isLoading={isLoading}
					viewMode={viewMode}
					worktreePath={checkout.path}
					selectedFilePath={
						isTarget && selectedDiffTarget
							? toAbsoluteWorkspacePath(checkout.path, selectedDiffTarget.path)
							: undefined
					}
					selectedChangeKey={
						isTarget ? selectedDiffTarget?.changeKey : undefined
					}
					foldSignal={foldSignal}
					onSelectFile={onSelectFile}
					onOpenFile={onOpenFile}
					onOpenInEditor={onOpenInEditor}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}
