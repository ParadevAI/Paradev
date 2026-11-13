import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HiEllipsisVertical } from "react-icons/hi2";
import { LuFolderGit2 } from "react-icons/lu";
import type { HostRepository } from "renderer/hooks/host-projects/useHostProjects";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { hostRefusalReason } from "../../utils/hostRefusalReason";
import { AddProjectRepository } from "../AddProjectRepository";

interface RepositoriesSectionProps {
	projectId: string;
	repositories: HostRepository[];
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	onChanged: () => void;
}

export function RepositoriesSection({
	projectId,
	repositories,
	hostUrl,
	hostName,
	isRemoteTarget,
	onChanged,
}: RepositoriesSectionProps) {
	const { t } = useLingui();
	const primary = repositories.find((repository) => repository.isPrimary);
	const [pendingRemoval, setPendingRemoval] = useState<HostRepository | null>(
		null,
	);
	const repositoryName = pendingRemoval?.name ?? "";
	const repositoryPath = pendingRemoval?.path ?? "";

	const makePrimary = useMutation({
		mutationFn: async (repositoryId: string) => {
			if (!hostUrl) return;
			await getHostServiceClientByUrl(
				hostUrl,
			).project.setPrimaryRepository.mutate({ projectId, repositoryId });
		},
		onSuccess: () => onChanged(),
		onError: (err) =>
			toast.error(t({ message: "Could not make it the primary repository" }), {
				description: hostRefusalReason(errorMessage(err)),
			}),
	});

	const remove = useMutation({
		mutationFn: async (repositoryId: string) => {
			if (!hostUrl) return;
			await getHostServiceClientByUrl(hostUrl).project.removeRepository.mutate({
				projectId,
				repositoryId,
			});
		},
		onSuccess: () => {
			setPendingRemoval(null);
			onChanged();
		},
		onError: (err) =>
			toast.error(t({ message: "Could not remove the repository" }), {
				description: hostRefusalReason(errorMessage(err)),
			}),
	});

	const busy = !hostUrl || makePrimary.isPending || remove.isPending;

	return (
		<div className="flex w-96 flex-col gap-1.5">
			{repositories.map((repository) => (
				<div
					key={repository.id}
					className={cn(
						"flex h-10 items-center gap-2 rounded-md border px-3 text-sm",
						repository.pathState !== "ok" && "border-destructive",
					)}
				>
					<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="shrink-0">{repository.name}</span>
					{repository.isPrimary && (
						<Badge variant="secondary" className="shrink-0">
							<Trans>Primary</Trans>
						</Badge>
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-xs",
							repository.pathState === "ok"
								? "text-muted-foreground"
								: "text-destructive",
						)}
						title={repository.path}
					>
						{repository.pathState === "missing" ? (
							<Trans>Folder is missing</Trans>
						) : repository.pathState === "inaccessible" ? (
							<Trans>Folder can't be read</Trans>
						) : (
							repository.path
						)}
					</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-6 shrink-0"
								disabled={busy}
								aria-label={t({
									message: `Actions for ${repository.name}`,
								})}
							>
								<HiEllipsisVertical className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								disabled={repository.isPrimary}
								onSelect={() => makePrimary.mutate(repository.id)}
							>
								<Trans>Make primary</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={repository.isPrimary}
								className="text-destructive focus:text-destructive"
								onSelect={() => setPendingRemoval(repository)}
							>
								<Trans>Remove from project</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			))}
			<AddProjectRepository
				projectId={projectId}
				primaryPath={primary?.path}
				hostUrl={hostUrl}
				hostName={hostName}
				isRemoteTarget={isRemoteTarget}
				onChanged={onChanged}
			/>
			<AlertDialog
				open={pendingRemoval !== null}
				onOpenChange={(open) => {
					if (!open && !remove.isPending) setPendingRemoval(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Remove {repositoryName} from the project?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								New workspaces stop checking it out. The folder stays on disk at{" "}
								{repositoryPath}.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={remove.isPending}>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={remove.isPending}
							variant="destructive"
							onClick={(e) => {
								e.preventDefault();
								if (pendingRemoval) remove.mutate(pendingRemoval.id);
							}}
						>
							<Trans>Remove</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
