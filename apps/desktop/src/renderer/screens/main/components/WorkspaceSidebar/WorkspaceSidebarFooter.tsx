import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuFolderGit, LuFolderOpen, LuFolderPlus } from "react-icons/lu";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";
import { CloneRepoDialog } from "../StartView/CloneRepoDialog";
import { STROKE_WIDTH } from "./constants";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
}: WorkspaceSidebarFooterProps) {
	const openNew = useOpenNew();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);

	const handleOpenProject = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (result.canceled) {
				return;
			}
			if ("error" in result && !("multi" in result)) {
				toast.error("Failed to open project", {
					description: result.error,
				});
				return;
			}

			if ("multi" in result) {
				const successes = result.results.filter((r) => r.status === "success");
				const needsGitInit = result.results.filter(
					(r) => r.status === "needsGitInit",
				);
				const errors = result.results.filter((r) => r.status === "error");

				// Create branch workspaces for all successful projects
				for (const s of successes) {
					try {
						await createBranchWorkspace.mutateAsync({
							projectId: s.project.id,
						});
					} catch (err) {
						toast.error(`Failed to open ${s.project.name}`, {
							description:
								err instanceof Error
									? err.message
									: "Failed to create workspace",
						});
					}
				}

				// Summary toast
				if (successes.length > 0) {
					toast.success(
						successes.length === 1
							? "Project opened"
							: `${successes.length} projects opened`,
					);
				}

				// Show errors
				for (const err of errors) {
					toast.error(`Failed to open ${err.selectedPath.split("/").pop()}`, {
						description: err.error,
					});
				}

				// Show git init warnings
				if (needsGitInit.length > 0) {
					const names = needsGitInit
						.map((r) => r.selectedPath.split("/").pop())
						.join(", ");
					toast.error(
						needsGitInit.length === 1
							? "Folder is not a git repository"
							: `${needsGitInit.length} folders are not git repositories`,
						{
							description: `${names} - use 'Open project' from the start view to initialize git.`,
						},
					);
				}
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const handleCloneError = (error: string) => {
		toast.error("Failed to clone repository", {
			description: error,
		});
	};

	const isLoading = openNew.isPending || createBranchWorkspace.isPending;

	if (isCollapsed) {
		return (
			<>
				<div className="border-t border-border p-2 flex justify-center">
					<DropdownMenu>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 text-muted-foreground hover:text-foreground"
										disabled={isLoading}
									>
										<LuFolderPlus
											className="size-4"
											strokeWidth={STROKE_WIDTH}
										/>
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="right">Add repository</TooltipContent>
						</Tooltip>
						<DropdownMenuContent side="top" align="start">
							<DropdownMenuItem
								onClick={handleOpenProject}
								disabled={isLoading}
							>
								<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
								Open project
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIsCloneDialogOpen(true)}
								disabled={isLoading}
							>
								<LuFolderGit className="size-4" strokeWidth={STROKE_WIDTH} />
								Clone repo
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<CloneRepoDialog
					isOpen={isCloneDialogOpen}
					onClose={() => setIsCloneDialogOpen(false)}
					onError={handleCloneError}
				/>
			</>
		);
	}

	return (
		<>
			<div className="border-t border-border p-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
							disabled={isLoading}
						>
							<LuFolderPlus className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
							<span>Add repository</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="top" align="start">
						<DropdownMenuItem onClick={handleOpenProject} disabled={isLoading}>
							<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
							Open project
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setIsCloneDialogOpen(true)}
							disabled={isLoading}
						>
							<LuFolderGit className="size-4" strokeWidth={STROKE_WIDTH} />
							Clone repo
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<CloneRepoDialog
				isOpen={isCloneDialogOpen}
				onClose={() => setIsCloneDialogOpen(false)}
				onError={handleCloneError}
			/>
		</>
	);
}
