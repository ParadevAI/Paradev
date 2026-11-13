import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronRight, LuFolderGit2 } from "react-icons/lu";
import type { WorkspaceCheckout } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/activeRepositoryStore";
import {
	type ChangesContentParams,
	useChangesContent,
} from "../../../../hooks/useChangesContent";

interface RepositoryChangesSectionProps extends ChangesContentParams {
	checkout: WorkspaceCheckout;
}

/** One repository's changes under a collapsible header, open while it has changes. */
export function RepositoryChangesSection({
	checkout,
	...params
}: RepositoryChangesSectionProps) {
	const { content, changedPathCount } = useChangesContent({
		...params,
		repositoryId: checkout.repositoryId,
		worktreePath: checkout.path,
		tagRepository: true,
		repositoryName: checkout.name,
	});
	const [userOpen, setUserOpen] = useState<boolean | null>(null);
	const open = userOpen ?? changedPathCount > 0;

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
				{content}
			</CollapsibleContent>
		</Collapsible>
	);
}
