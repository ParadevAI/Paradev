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
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ staleTime: 30_000 },
	);
	const projectId = workspaceQuery.data?.projectId;
	const projectQuery = workspaceTrpc.project.get.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: Boolean(projectId), staleTime: 30_000 },
	);
	const name = projectQuery.data?.repoName || projectQuery.data?.name;
	if (!name) return null;
	return (
		<div className="px-2 pt-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground transition-colors hover:bg-accent/60"
					>
						<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate text-left">{name}</span>
						<LuChevronDown className="size-3 shrink-0 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-(--radix-dropdown-menu-trigger-width)"
				>
					<DropdownMenuItem>
						<LuFolderGit2 className="text-muted-foreground" />
						<span className="flex-1 truncate">{name}</span>
						<LuCheck />
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
