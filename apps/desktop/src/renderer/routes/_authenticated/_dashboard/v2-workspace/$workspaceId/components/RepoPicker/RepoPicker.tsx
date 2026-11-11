import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck, LuChevronDown, LuFolderGit2 } from "react-icons/lu";
import {
	useActiveRepositoryWorkspaceId,
	useSelectRepository,
	useWorkspaceRepositories,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/activeRepositoryStore";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export function RepoPicker() {
	const workspaceId = useWorkspace().workspace.id;
	const activeId = useActiveRepositoryWorkspaceId(workspaceId);
	const select = useSelectRepository();
	const repositories = useWorkspaceRepositories(workspaceId);
	const current = repositories.find((repository) => repository.id === activeId);
	if (repositories.length < 2 || !current) return null;
	return (
		<div className="px-2 pt-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground transition-colors hover:bg-accent/60"
					>
						<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate text-left">
							{current.name}
						</span>
						<LuChevronDown className="size-3 shrink-0 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-(--radix-dropdown-menu-trigger-width)"
				>
					{repositories.map((repository) => (
						<DropdownMenuItem
							key={repository.id}
							onSelect={() => select(workspaceId, repository.id)}
						>
							<LuFolderGit2 className="text-muted-foreground" />
							<span className="flex-1 truncate">{repository.name}</span>
							<span className="max-w-32 truncate text-xs text-muted-foreground">
								{repository.branch}
							</span>
							{repository.id === current.id && <LuCheck />}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
