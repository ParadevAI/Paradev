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
import { PrimaryRepositoryBadge } from "renderer/routes/_authenticated/components/PrimaryRepositoryBadge";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	buildCreateProjectInput,
	type ProjectSource,
	sourceKey,
} from "./utils/buildCreateProjectInput";
import { defaultProjectName } from "./utils/defaultProjectName";
import { parentOf } from "./utils/parentOf";
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
	const [sources, setSources] = useState<ProjectSource[]>([]);
	const [pickedPrimaryKey, setPickedPrimaryKey] = useState<string | null>(null);
	const [typedName, setTypedName] = useState<string | null>(null);
	const [working, setWorking] = useState(false);
	const name = typedName ?? defaultProjectName(sources[0]);
	const cloneDir = homeDir
		? `${homeDir}/.paradev/projects/${projectFolderName(name)}`
		: "";
	const keys = sources.map(sourceKey);
	const primaryKey =
		pickedPrimaryKey && keys.includes(pickedPrimaryKey)
			? pickedPrimaryKey
			: keys[0];
	const hasClones = sources.some((source) => source.kind === "clone");

	const reset = () => {
		setSources([]);
		setPickedPrimaryKey(null);
		setTypedName(null);
		setWorking(false);
	};

	const removeSource = (key: string) =>
		setSources((current) =>
			current.filter((source) => sourceKey(source) !== key),
		);

	const toggleClone = (clone: CloneSource) =>
		setSources((current) =>
			current.some((source) => sourceKey(source) === clone.url)
				? current.filter((source) => sourceKey(source) !== clone.url)
				: [...current, { kind: "clone", url: clone.url, label: clone.label }],
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
			setSources((current) => {
				const known = new Set(current.map(sourceKey));
				const added = [...new Set(picked.paths)]
					.filter((path) => !known.has(path))
					.map((path): ProjectSource => ({ kind: "local", path }));
				return [...current, ...added];
			});
		} catch (err) {
			toast.error(errorMessage(err));
		}
	};

	const create = async () => {
		if (sources.length === 0 || !name.trim()) return;
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, { action: "createProject" });
			return;
		}
		setWorking(true);
		try {
			const result = await getHostServiceClientByUrl(
				activeHostUrl,
			).project.create.mutate(
				buildCreateProjectInput({ name, sources, primaryKey, cloneDir }),
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
						{sources.map((source) => {
							const key = sourceKey(source);
							const repositoryName =
								source.kind === "local"
									? getBaseName(source.path)
									: source.label;
							return (
								<div
									key={key}
									className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"
								>
									{source.kind === "local" ? (
										<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
									) : (
										<LuGithub className="size-3.5 shrink-0 text-muted-foreground" />
									)}
									<span
										className="min-w-0 shrink truncate"
										title={source.kind === "clone" ? source.url : undefined}
									>
										{repositoryName}
									</span>
									<span
										className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
										title={source.kind === "local" ? source.path : undefined}
									>
										{source.kind === "local" ? parentOf(source.path) : null}
									</span>
									{key === primaryKey ? (
										<PrimaryRepositoryBadge />
									) : (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-6 shrink-0 px-2 text-xs text-muted-foreground"
											disabled={working}
											onClick={() => setPickedPrimaryKey(key)}
										>
											<Trans>Make primary</Trans>
										</Button>
									)}
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-6 shrink-0"
										aria-label={t({ message: "Remove repository" })}
										disabled={working}
										onClick={() => removeSource(key)}
									>
										<LuX className="size-3.5" />
									</Button>
								</div>
							);
						})}
						<AddRepositoryMenu
							hostUrl={activeHostUrl}
							disabled={working || selectDirectory.isPending}
							selectedCloneUrls={sources.flatMap((source) =>
								source.kind === "clone" ? [source.url] : [],
							)}
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
							sources.length === 0 ||
							!name.trim() ||
							(hasClones && !cloneDir)
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
