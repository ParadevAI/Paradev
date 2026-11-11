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
import { LuFolderGit2, LuLoaderCircle, LuPlus, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface NewLocalProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: (result: { projectId: string }) => void;
}

const parentOf = (path: string) => path.replace(/[/\\]+[^/\\]+[/\\]*$/, "");

function defaultName(repoPaths: string[]): string {
	const [first] = repoPaths;
	if (!first) return "";
	const parent = parentOf(first);
	const shareParent =
		repoPaths.length > 1 &&
		repoPaths.every((path) => parentOf(path) === parent);
	return getBaseName(shareParent ? parent : first);
}

export function NewLocalProjectModal({
	open,
	onOpenChange,
	onSuccess,
}: NewLocalProjectModalProps) {
	const { t } = useLingui();
	const { activeHostUrl } = useLocalHostService();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const [repoPaths, setRepoPaths] = useState<string[]>([]);
	const [typedName, setTypedName] = useState<string | null>(null);
	const [working, setWorking] = useState(false);
	const name = typedName ?? defaultName(repoPaths);

	const reset = () => {
		setRepoPaths([]);
		setTypedName(null);
		setWorking(false);
	};

	const handleOpenChange = (next: boolean) => {
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
		if (!activeHostUrl || repoPaths.length === 0 || !name.trim()) return;
		setWorking(true);
		try {
			const result = await getHostServiceClientByUrl(
				activeHostUrl,
			).project.createContainer.mutate({ name: name.trim(), repoPaths });
			onSuccess(result);
			handleOpenChange(false);
		} catch (err) {
			toast.error(t({ message: "Could not create project" }), {
				description: errorMessage(err),
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

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="local-project-name" className="text-xs">
							<Trans>Project name</Trans>
						</Label>
						<Input
							id="local-project-name"
							value={name}
							onChange={(event) => setTypedName(event.target.value)}
							placeholder="my-project"
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
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="self-start"
							disabled={working || selectDirectory.isPending}
							onClick={() => void addRepository()}
						>
							<LuPlus className="size-3.5" />
							<Trans>Add repository</Trans>
						</Button>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => handleOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={() => void create()}
						disabled={working || repoPaths.length === 0 || !name.trim()}
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
