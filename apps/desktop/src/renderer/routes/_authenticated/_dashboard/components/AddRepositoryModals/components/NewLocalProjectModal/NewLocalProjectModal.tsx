import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuFolderGit2, LuGithub, LuLoaderCircle, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { hostRefusalReason } from "renderer/lib/hostRefusalReason";
import { getBaseName } from "renderer/lib/pathBasename";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import {
	AddRepositoryMenu,
	type CloneSource,
} from "renderer/routes/_authenticated/components/AddRepositoryMenu";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { buildCreateProjectInput } from "./utils/buildCreateProjectInput";
import { defaultProjectName, parentOf } from "./utils/defaultProjectName";
import { projectFolderName } from "./utils/projectFolderName";

interface NewLocalProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: (result: { projectId: string }) => void;
}

export function NewLocalProjectModal({
	open,
	onOpenChange,
	onSuccess,
}: NewLocalProjectModalProps) {
	const { t } = useLingui();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const [repoPaths, setRepoPaths] = useState<string[]>([]);
	const [clones, setClones] = useState<CloneSource[]>([]);
	const [typedName, setTypedName] = useState<string | null>(null);
	const [working, setWorking] = useState(false);
	const name =
		typedName ??
		defaultProjectName(
			repoPaths,
			clones.map((clone) => clone.url),
		);
	const cloneDir = homeDir
		? `${homeDir}/.paradev/projects/${projectFolderName(name)}`
		: "";
	const repositoryCount = repoPaths.length + clones.length;

	const reset = () => {
		setRepoPaths([]);
		setClones([]);
		setTypedName(null);
		setWorking(false);
	};

	const toggleClone = (source: CloneSource) =>
		setClones((current) =>
			current.some((clone) => clone.url === source.url)
				? current.filter((clone) => clone.url !== source.url)
				: [...current, source],
		);

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const addRepository = async () => {
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Select repositories" }),
				multiple: true,
			});
			if (picked.canceled) return;
			setRepoPaths((paths) => [...new Set([...paths, ...picked.paths])]);
		} catch (err) {
			toast.error(errorMessage(err));
		}
	};

	const create = async () => {
		if (repositoryCount === 0 || !name.trim()) return;
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, { action: "createProject" });
			return;
		}
		setWorking(true);
		try {
			const result = await getHostServiceClientByUrl(
				activeHostUrl,
			).project.create.mutate(
				buildCreateProjectInput({
					name,
					repoPaths,
					cloneUrls: clones.map((clone) => clone.url),
					cloneDir,
				}),
			);
			finalizeSetup(activeHostUrl, {
				projectId: result.id,
			});
			onSuccess({ projectId: result.id });
			reset();
			onOpenChange(false);
		} catch (err) {
			toast.error(t({ message: "Could not create project" }), {
				description: hostRefusalReason(errorMessage(err)),
			});
		} finally {
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent className="max-w-[480px]">
				<DialogHeader>
					<DialogTitle>
						<Trans>New project</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							A project holds one or more repositories. Every workspace checks
							out all of them, side by side.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<div className="flex min-w-0 flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="local-project-name" className="text-xs">
							<Trans>Project name</Trans>
						</Label>
						<Input
							id="local-project-name"
							value={name}
							onChange={(event) => setTypedName(event.target.value)}
							placeholder={t({ message: "my-project" })}
							disabled={working}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label className="text-xs">
							<Trans>Repositories</Trans>
						</Label>
						{repoPaths.map((repoPath) => (
							<div
								key={repoPath}
								className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"
							>
								<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="shrink-0">{getBaseName(repoPath)}</span>
								<span
									className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
									title={repoPath}
								>
									{parentOf(repoPath)}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-6"
									aria-label={t({ message: "Remove repository" })}
									disabled={working}
									onClick={() =>
										setRepoPaths((paths) =>
											paths.filter((path) => path !== repoPath),
										)
									}
								>
									<LuX className="size-3.5" />
								</Button>
							</div>
						))}
						{clones.map((clone) => (
							<div
								key={clone.url}
								className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"
							>
								<LuGithub className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate" title={clone.url}>
									{clone.label}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-6"
									aria-label={t({ message: "Remove repository" })}
									disabled={working}
									onClick={() => toggleClone(clone)}
								>
									<LuX className="size-3.5" />
								</Button>
							</div>
						))}
						<AddRepositoryMenu
							hostUrl={activeHostUrl}
							disabled={working || selectDirectory.isPending}
							selectedCloneUrls={clones.map((clone) => clone.url)}
							onAddLocal={() => void addRepository()}
							onToggleClone={toggleClone}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						disabled={working}
						onClick={() => handleOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={() => void create()}
						disabled={
							working ||
							repositoryCount === 0 ||
							!name.trim() ||
							(clones.length > 0 && !cloneDir)
						}
					>
						{working ? (
							<>
								<LuLoaderCircle className="size-4 animate-spin" />
								<Trans>Creating…</Trans>
							</>
						) : (
							<Trans>Create project</Trans>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
