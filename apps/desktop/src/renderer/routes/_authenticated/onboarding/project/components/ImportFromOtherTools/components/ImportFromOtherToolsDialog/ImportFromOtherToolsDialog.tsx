import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useId, useState } from "react";
import {
	LuCircle,
	LuCircleAlert,
	LuCircleCheck,
	LuFolderGit2,
	LuLoaderCircle,
} from "react-icons/lu";
import { track } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import type { ExternalWorktreeOffer } from "../../hooks/useExternalWorktrees";
import { ToolIcon } from "../ToolIcon";
import { ToolIconStack } from "../ToolIconStack";

type ItemStatus =
	| { state: "idle" }
	| { state: "queued" }
	| { state: "importing" }
	| { state: "done" }
	| { state: "failed"; error: string };

type Phase = "choose" | "importing" | "done";

interface ImportFromOtherToolsDialogProps {
	open: boolean;
	offer: ExternalWorktreeOffer;
	hostId: string;
	onOpenChange: (open: boolean) => void;
	onImported: (projectId: string) => Promise<void>;
}

export function ImportFromOtherToolsDialog({
	open,
	offer,
	hostId,
	onOpenChange,
	onImported,
}: ImportFromOtherToolsDialogProps) {
	const { t } = useLingui();
	const idPrefix = useId();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const displayPath = (path: string) =>
		homeDir && path.startsWith(`${homeDir}/`)
			? `~${path.slice(homeDir.length)}`
			: path;
	const { submit } = useWorkspaceCreates();
	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const allPaths = offer.repos.flatMap((repo) =>
		repo.worktrees.map((worktree) => worktree.path),
	);
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(allPaths),
	);
	const [status, setStatus] = useState<Record<string, ItemStatus>>({});
	const [phase, setPhase] = useState<Phase>("choose");
	const [firstProjectId, setFirstProjectId] = useState<string | null>(null);

	const selectedCount = selected.size;
	const importedCount = Object.values(status).filter(
		(item) => item.state === "done",
	).length;

	const setItem = (path: string, item: ItemStatus) =>
		setStatus((current) => ({ ...current, [path]: item }));

	const toggle = (path: string, checked: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			if (checked) next.add(path);
			else next.delete(path);
			return next;
		});

	const handleImport = async () => {
		setPhase("importing");
		setStatus(
			Object.fromEntries(
				[...selected].map((path) => [path, { state: "queued" } as ItemStatus]),
			),
		);
		let projectId: string | null = null;
		let imported = 0;
		for (const repo of offer.repos) {
			const worktrees = repo.worktrees.filter((w) => selected.has(w.path));
			if (worktrees.length === 0) continue;
			for (const worktree of worktrees) {
				setItem(worktree.path, { state: "importing" });
			}
			const project = await folderImport.start(repo.repoPath);
			if (!project) {
				for (const worktree of worktrees) {
					setItem(worktree.path, {
						state: "failed",
						error: t`Couldn't add this repo`,
					});
				}
				continue;
			}
			await Promise.all(
				worktrees.map(async (worktree) => {
					const outcome = await submit({
						hostId,
						snapshot: {
							id: crypto.randomUUID(),
							projectId: project.projectId,
							branch: worktree.branch,
							worktreePath: worktree.path,
							runSetup: false,
						},
					}).completed;
					if (outcome.ok) {
						imported += 1;
						projectId ??= project.projectId;
						setItem(worktree.path, { state: "done" });
					} else {
						setItem(worktree.path, { state: "failed", error: outcome.error });
					}
				}),
			);
		}
		track("external_worktrees_imported", {
			sources: offer.sources,
			repo_count: offer.repos.length,
			worktree_count: selectedCount,
			imported_count: imported,
		});
		setFirstProjectId(projectId);
		setPhase("done");
	};

	const busy = phase === "importing";

	return (
		<Dialog open={open} onOpenChange={busy ? undefined : onOpenChange} modal>
			<DialogContent
				aria-describedby={undefined}
				className="max-w-lg gap-5 outline-none"
			>
				<DialogHeader>
					<div className="mb-2">
						<ToolIconStack sources={offer.sources} />
					</div>
					<DialogTitle>
						{phase === "done"
							? importedCount > 0
								? t`Imported`
								: t`Couldn't import`
							: t({ message: `Import from ${offer.toolNames}` })}
					</DialogTitle>
				</DialogHeader>

				<div className="-mx-1 flex max-h-72 flex-col gap-4 overflow-y-auto overscroll-contain px-1">
					{offer.repos
						.filter(
							(repo) =>
								phase === "choose" ||
								repo.worktrees.some((w) => selected.has(w.path)),
						)
						.map((repo, repoIndex) => (
							<section key={repo.repoPath} className="flex flex-col gap-1">
								<div className="flex min-w-0 items-center gap-2 px-1 text-muted-foreground text-xs">
									<LuFolderGit2 className="size-3.5 shrink-0" />
									<span className="font-medium text-foreground">
										{repo.name}
									</span>
									<span className="truncate">{displayPath(repo.repoPath)}</span>
								</div>
								<ul className="flex flex-col">
									{repo.worktrees
										.filter(
											(worktree) =>
												phase === "choose" || selected.has(worktree.path),
										)
										.map((worktree, worktreeIndex) => {
											const item = status[worktree.path] ?? { state: "idle" };
											const checked = selected.has(worktree.path);
											const checkboxId = `${idPrefix}-${repoIndex}-${worktreeIndex}`;
											return (
												<li key={worktree.path}>
													<label
														htmlFor={checkboxId}
														className={cn(
															"flex items-center gap-3 rounded-md px-1 py-1.5",
															phase === "choose" &&
																"cursor-pointer hover:bg-foreground/[0.05]",
														)}
													>
														{phase === "choose" ? (
															<Checkbox
																id={checkboxId}
																checked={checked}
																onCheckedChange={(value) =>
																	toggle(worktree.path, value === true)
																}
															/>
														) : (
															<span className="flex size-4 shrink-0 items-center justify-center">
																{item.state === "queued" && (
																	<LuCircle className="size-3.5 text-muted-foreground/50" />
																)}
																{item.state === "importing" && (
																	<LuLoaderCircle className="size-4 animate-spin text-muted-foreground" />
																)}
																{item.state === "done" && (
																	<LuCircleCheck className="size-4 text-emerald-500" />
																)}
																{item.state === "failed" && (
																	<LuCircleAlert className="size-4 text-destructive" />
																)}
															</span>
														)}
														<ToolIcon
															source={worktree.source}
															className="size-4 rounded-[4px] text-[8px]"
														/>
														<span className="flex min-w-0 flex-1 flex-col">
															<span className="truncate font-mono text-[13px] text-foreground">
																{worktree.branch}
															</span>
															{item.state === "failed" && (
																<span className="truncate text-destructive text-xs">
																	{item.error}
																</span>
															)}
														</span>
													</label>
												</li>
											);
										})}
								</ul>
							</section>
						))}
				</div>

				<DialogFooter>
					{phase === "done" ? (
						firstProjectId ? (
							<Button autoFocus onClick={() => onImported(firstProjectId)}>
								{t`Continue`}
							</Button>
						) : (
							<Button
								autoFocus
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								{t`Close`}
							</Button>
						)
					) : (
						<>
							<Button
								variant="ghost"
								disabled={busy}
								onClick={() => onOpenChange(false)}
							>
								{t`Cancel`}
							</Button>
							<Button
								disabled={busy || selectedCount === 0}
								onClick={handleImport}
							>
								{busy ? t`Importing…` : t`Import`}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
