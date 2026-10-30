import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { workspaceTrpc } from "@superset/workspace-client";
import { LuCheck, LuChevronDown, LuFolderGit2 } from "react-icons/lu";

interface RepoPickerProps {
	workspaceId: string;
}

export function RepoPicker({ workspaceId }: RepoPickerProps) {
	// A host older than workspace.repositories errors here, which hides the
	// picker the same way a single repository does.
	const repositoriesQuery = workspaceTrpc.workspace.repositories.useQuery(
		{ workspaceId },
		{ retry: false, staleTime: 30_000 },
	);
	const repositories = repositoriesQuery.data ?? [];
	const current = repositories.find((repository) => repository.primary);
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
						<DropdownMenuItem key={repository.id}>
							<LuFolderGit2 className="text-muted-foreground" />
							<span className="flex-1 truncate">{repository.name}</span>
							{repository.id === current.id && <LuCheck />}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
