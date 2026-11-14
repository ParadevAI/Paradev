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
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuFolderOpen } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import type { HostRepository } from "renderer/hooks/host-projects/useHostProjects";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { hostRefusalReason } from "renderer/lib/hostRefusalReason";
import { ClickablePath } from "../../../../../../components/ClickablePath";

interface ProjectLocationSectionProps {
	projectId: string;
	/** Null when the project has no row on the targeted host. */
	repository: Pick<HostRepository, "id" | "path" | "pathState"> | null;
	/** Set when the project has several repositories, to name the one moved. */
	repositoryName?: string;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	onChanged?: () => void;
}

export function ProjectLocationSection({
	projectId,
	repository,
	repositoryName,
	hostUrl,
	hostName,
	isRemoteTarget,
	onChanged,
}: ProjectLocationSectionProps) {
	const { t } = useLingui();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const [pendingPath, setPendingPath] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [changeBrowseOpen, setChangeBrowseOpen] = useState(false);
	const currentPath = repository?.path ?? null;
	const isPathMissing = repository !== null && repository.pathState !== "ok";

	const pickPath = async (title: string) => {
		if (!hostUrl) {
			toast.error(
				t({
					message: `Host unavailable: ${hostName}`,
				}),
			);
			return null;
		}
		try {
			const picked = await selectDirectory.mutateAsync({
				title,
				defaultPath: currentPath ?? undefined,
			});
			if (picked.canceled || !picked.path) return null;
			return picked.path;
		} catch (err) {
			toast.error(errorMessage(err));
			return null;
		}
	};

	const proposeRelocate = async (path: string) => {
		if (path === currentPath) {
			toast.info(
				t({
					message: "Project is already at that location",
				}),
			);
			return;
		}
		if (!hostUrl) {
			toast.error(
				t({
					message: `Host unavailable: ${hostName}`,
				}),
			);
			return;
		}
		setPendingPath(path);
	};

	const handleChange = async () => {
		if (isRemoteTarget) {
			setChangeBrowseOpen(true);
			return;
		}
		const path = await pickPath(
			t({
				message: "Select new project location",
			}),
		);
		if (!path) return;
		await proposeRelocate(path);
	};

	const handleConfirmRelocate = async () => {
		if (!pendingPath || !repository) return;
		if (!hostUrl) {
			toast.error(
				t({
					message: `Host unavailable: ${hostName}`,
				}),
			);
			return;
		}
		setIsSubmitting(true);
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.project.relocateRepository.mutate({
				projectId,
				repositoryId: repository.id,
				path: pendingPath,
			});
			const newPath =
				result.repositories.find((r) => r.id === repository.id)?.path ??
				pendingPath;
			toast.success(
				repositoryName
					? t({ message: `${repositoryName} relocated to ${newPath}` })
					: t({ message: `Project relocated to ${newPath}` }),
			);
			onChanged?.();
			setPendingPath(null);
		} catch (err) {
			toast.error(hostRefusalReason(errorMessage(err)));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			{currentPath ? (
				<div className="flex w-[28rem] max-w-full flex-col gap-1.5">
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"flex h-9 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border bg-transparent px-3 dark:bg-input/30",
								isPathMissing && "border-destructive",
							)}
						>
							<ClickablePath
								path={currentPath}
								className="max-w-none shrink-0"
							/>
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="icon"
									className="size-9 shrink-0"
									onClick={handleChange}
									disabled={selectDirectory.isPending || isSubmitting}
									aria-label={t({
										message: "Change location",
									})}
								>
									<LuFolderOpen className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<Trans>Change location</Trans>
							</TooltipContent>
						</Tooltip>
					</div>
					{isPathMissing && (
						<p className="text-xs text-destructive">
							{repository?.pathState === "inaccessible" ? (
								<Trans>Folder can't be read</Trans>
							) : (
								<Trans>Folder is missing</Trans>
							)}
						</p>
					)}
				</div>
			) : (
				<span className="text-sm text-muted-foreground">
					<Trans>Not set up on {hostName}</Trans>
				</span>
			)}

			<RemotePathPicker
				open={changeBrowseOpen}
				onOpenChange={setChangeBrowseOpen}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={currentPath ?? undefined}
				title={t({
					message: "Change project location",
				})}
				description={t({
					message: `Pick the new project folder on ${hostName}.`,
				})}
				confirmLabel={t({
					message: "Use this folder",
				})}
				onPick={(path) => {
					void proposeRelocate(path);
				}}
			/>

			<AlertDialog
				open={pendingPath !== null}
				onOpenChange={(open) => {
					if (!open && !isSubmitting) setPendingPath(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{repositoryName ? (
								<Trans>Relocate {repositoryName}?</Trans>
							) : (
								<Trans>Relocate project?</Trans>
							)}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-3 text-sm select-text cursor-text">
								<div>
									<div className="text-muted-foreground text-xs">
										<Trans>From</Trans>
									</div>
									<div className="font-mono break-all">{currentPath}</div>
								</div>
								<div>
									<div className="text-muted-foreground text-xs">
										<Trans>To</Trans>
									</div>
									<div className="font-mono break-all">{pendingPath}</div>
								</div>
								<p className="text-muted-foreground">
									<Trans>
										You cannot relocate while workspaces use worktrees of this
										folder. Delete those workspaces first.
									</Trans>
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isSubmitting}>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								handleConfirmRelocate();
							}}
							disabled={isSubmitting}
						>
							{isSubmitting ? (
								<Trans>Relocating…</Trans>
							) : (
								<Trans>Relocate</Trans>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
