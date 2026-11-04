import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { toast } from "@superset/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowDownToLine, LuChevronRight } from "react-icons/lu";
import { track } from "renderer/lib/analytics";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { SOURCE_NAMES } from "./constants";

interface ImportFromOtherToolsRowProps {
	disabled: boolean;
	onBusyChange: (busy: boolean) => void;
	onImported: (projectId: string) => Promise<void>;
}

export function ImportFromOtherToolsRow({
	disabled,
	onBusyChange,
	onImported,
}: ImportFromOtherToolsRowProps) {
	const { t } = useLingui();
	const { activeHostUrl, machineId } = useLocalHostService();
	const { submit } = useWorkspaceCreates();
	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const [importing, setImporting] = useState(false);
	const offeredRef = useRef(false);

	const { data } = useQuery({
		queryKey: ["external-worktrees", activeHostUrl],
		enabled: !!activeHostUrl,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: () =>
			getHostServiceClientByUrl(
				activeHostUrl as string,
			).project.detectExternalWorktrees.query(),
	});
	const { repos, worktreeCount, sources } = useMemo(() => {
		const repos = data?.repos ?? [];
		return {
			repos,
			worktreeCount: repos.reduce(
				(count, repo) => count + repo.worktrees.length,
				0,
			),
			sources: [
				...new Set(
					repos.flatMap((repo) => repo.worktrees.map((w) => w.source)),
				),
			],
		};
	}, [data]);

	useEffect(() => {
		if (offeredRef.current || repos.length === 0) return;
		offeredRef.current = true;
		track("external_worktrees_offered", {
			sources,
			repo_count: repos.length,
			worktree_count: worktreeCount,
		});
	}, [repos.length, sources, worktreeCount]);

	if (repos.length === 0 || !machineId) return null;

	const handleImport = async () => {
		setImporting(true);
		onBusyChange(true);
		let firstProjectId: string | null = null;
		let imported = 0;
		let firstError: string | null = null;
		try {
			for (const repo of repos) {
				const project = await folderImport.start(repo.repoPath);
				if (!project) continue;
				firstProjectId ??= project.projectId;
				const outcomes = await Promise.all(
					repo.worktrees.map(
						(worktree) =>
							submit({
								hostId: machineId,
								snapshot: {
									id: crypto.randomUUID(),
									projectId: project.projectId,
									branch: worktree.branch,
									worktreePath: worktree.path,
									runSetup: false,
								},
							}).completed,
					),
				);
				for (const outcome of outcomes) {
					if (outcome.ok) imported += 1;
					else firstError ??= outcome.error;
				}
			}
			track("external_worktrees_imported", {
				sources,
				repo_count: repos.length,
				worktree_count: worktreeCount,
				imported_count: imported,
			});
			if (firstError) {
				toast.error(
					t({
						message: `Imported ${imported} of ${worktreeCount} worktrees: ${firstError}`,
					}),
				);
			}
			if (firstProjectId) await onImported(firstProjectId);
		} finally {
			setImporting(false);
			onBusyChange(false);
		}
	};

	const toolNames = formatList(
		sources.map((source) => SOURCE_NAMES[source] ?? source),
	);
	const repoLabel = plural(repos.length, {
		one: "# repository",
		other: "# repositories",
	});
	const worktreeLabel = plural(worktreeCount, {
		one: "# worktree",
		other: "# worktrees",
	});

	return (
		<button
			type="button"
			onClick={handleImport}
			disabled={disabled || importing}
			className="flex items-center gap-3 rounded-lg bg-foreground/[0.05] p-4 text-left outline-none transition-colors hover:bg-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
		>
			<LuArrowDownToLine className="size-5 shrink-0 text-foreground" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium text-foreground text-sm">
					{t({ message: `Import from ${toolNames}` })}
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{importing
						? t`Importing…`
						: t({ message: `${worktreeLabel} in ${repoLabel}` })}
				</span>
			</span>
			<LuChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}
