import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatList } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { hostRefusalReason } from "renderer/lib/hostRefusalReason";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { PathField } from "./components/PathField";
import { SetupRepositoryRow } from "./components/SetupRepositoryRow";
import {
	buildSetupInput,
	defaultRepositoryChoice,
	type RepositoryChoice,
	type SetupOriginProject,
} from "./utils/buildSetupInput";

const PARENT_DIR = "parentDir";

interface SetupProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	project: SetupOriginProject;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	onChanged?: () => void;
}

export function SetupProjectModal({
	open,
	onOpenChange,
	projectId,
	project,
	hostUrl,
	hostName,
	isRemoteTarget,
	onChanged,
}: SetupProjectModalProps) {
	const { t } = useLingui();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	const [parentDir, setParentDir] = useState("");
	const [choices, setChoices] = useState<Record<string, RepositoryChoice>>({});
	const [working, setWorking] = useState(false);
	const [browseTarget, setBrowseTarget] = useState<string | null>(null);

	const choiceOf = (repository: SetupOriginProject["repositories"][number]) =>
		choices[repository.id] ?? defaultRepositoryChoice(repository);
	const clones = project.repositories.some(
		(repository) => choiceOf(repository).kind === "clone",
	);

	const reset = () => {
		setParentDir("");
		setChoices({});
		setWorking(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const setPath = (target: string, path: string) => {
		if (target === PARENT_DIR) setParentDir(path);
		else
			setChoices((prev) => ({ ...prev, [target]: { kind: "import", path } }));
	};

	const browse = async (target: string) => {
		if (isRemoteTarget) {
			setBrowseTarget(target);
			return;
		}
		try {
			const result = await selectDirectory.mutateAsync({
				title:
					target === PARENT_DIR
						? t({ message: "Select a folder to clone into" })
						: t({ message: "Select the repository folder" }),
			});
			if (result.canceled || !result.path) return;
			setPath(target, result.path);
		} catch (err) {
			toast.error(errorMessage(err));
		}
	};

	const submit = async () => {
		if (!hostUrl) {
			toast.error(t({ message: `Host unavailable: ${hostName}` }));
			return;
		}
		const built = buildSetupInput({ projectId, project, parentDir, choices });
		if (!built.ok) {
			const names = formatList(built.missing);
			toast.error(t({ message: `Pick a folder for ${names}` }));
			return;
		}
		setWorking(true);
		try {
			await getHostServiceClientByUrl(hostUrl).project.setup.mutate(
				built.input,
			);
			toast.success(t({ message: `Project set up on ${hostName}` }));
			ensureProjectInSidebar(projectId);
			onChanged?.();
			reset();
			onOpenChange(false);
		} catch (err) {
			toast.error(hostRefusalReason(errorMessage(err)));
		} finally {
			setWorking(false);
		}
	};

	const pathPlaceholder = isRemoteTarget
		? "/home/user/projects/my-repo"
		: t({ message: "Pick a folder…" });
	const browseInitialPath =
		browseTarget === PARENT_DIR
			? parentDir
			: browseTarget
				? (() => {
						const choice = choices[browseTarget];
						return choice?.kind === "import" ? choice.path : "";
					})()
				: "";

	return (
		<>
			<Dialog open={open} onOpenChange={handleOpenChange} modal>
				<DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col sm:max-w-[560px]">
					<DialogHeader className="shrink-0">
						<DialogTitle>
							<Trans>Set up project on {hostName}</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Clone each repository, or use a folder that is already on the
								host.
							</Trans>
						</DialogDescription>
					</DialogHeader>

					<div className="-mx-6 -my-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-6 py-1">
						{clones && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-parent-dir" className="text-xs">
									{isRemoteTarget ? (
										<Trans>Clone into a folder on {hostName}</Trans>
									) : (
										<Trans>Clone into</Trans>
									)}
								</Label>
								<PathField
									id="setup-parent-dir"
									value={parentDir}
									onChange={setParentDir}
									onBrowse={() => void browse(PARENT_DIR)}
									placeholder={
										isRemoteTarget
											? "/home/user/projects"
											: t({ message: "Pick a folder…" })
									}
									disabled={working || selectDirectory.isPending}
								/>
							</div>
						)}
						{project.repositories.map((repository) => (
							<SetupRepositoryRow
								key={repository.id}
								repository={repository}
								choice={choiceOf(repository)}
								onChange={(choice) =>
									setChoices((prev) => ({ ...prev, [repository.id]: choice }))
								}
								onBrowse={() => void browse(repository.id)}
								pathPlaceholder={pathPlaceholder}
								disabled={working || selectDirectory.isPending}
							/>
						))}
					</div>

					<DialogFooter className="shrink-0">
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
							disabled={working}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							type="button"
							onClick={() => void submit()}
							disabled={working || !hostUrl}
						>
							{working && <LuLoaderCircle className="size-4 animate-spin" />}
							<Trans>Set up</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<RemotePathPicker
				open={browseTarget !== null}
				onOpenChange={(next) => {
					if (!next) setBrowseTarget(null);
				}}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={browseInitialPath || undefined}
				title={
					browseTarget === PARENT_DIR
						? t({ message: "Choose a folder to clone into" })
						: t({ message: "Choose the repository folder" })
				}
				confirmLabel={t({ message: "Use this folder" })}
				onPick={(path) => {
					if (browseTarget) setPath(browseTarget, path);
				}}
			/>
		</>
	);
}
