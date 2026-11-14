import { msg } from "@lingui/core/macro";
import { useLingui as useTranslation } from "@lingui/react";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuLayoutGrid } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { hostRefusalReason } from "renderer/lib/hostRefusalReason";
import {
	adoptV1Workspace,
	recordV1MigrationOutcome,
} from "renderer/lib/v1-migration";
import { electronV1MigrationIpc } from "renderer/lib/v1-migration/ipc";
import { isForeignV1Workspace } from "renderer/lib/v1-migration/ownership";
import { withV1MigrationRunLock } from "renderer/lib/v1-migration/run-lock";
import {
	adoptV1WorkspaceGroupIntoMultiRepoProject,
	findGitWorktreeAtFolder,
	mapV1ProjectsToV2Targets,
} from "renderer/lib/v1-migration/workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { ImportPageShell } from "../components/ImportPageShell";
import { ImportRow, type RowAction } from "../components/ImportRow";
import { useForeignV1Claims } from "../hooks/useForeignV1Claims";
import { importedV1WorkspaceCheck } from "./utils/importedV1WorkspaceCheck";

interface ImportWorkspacesPageProps {
	organizationId: string;
	activeHostUrl: string;
}

const WORKTREE_LIST_KEY_PREFIX = ["v1-import", "projectWorktrees"] as const;
const WORKSPACE_LIST_KEY = ["v1-import", "hostWorkspaceList"] as const;
const HOST_PROJECT_LIST_KEY_PREFIX = ["v1-import", "hostProjectList"] as const;

type AdoptStatus =
	| { kind: "idle" }
	| { kind: "running" }
	| { kind: "imported" }
	| { kind: "error"; message: string };

const IDLE: AdoptStatus = { kind: "idle" };

export function ImportWorkspacesPage({
	organizationId,
	activeHostUrl,
}: ImportWorkspacesPageProps) {
	const { _: translate } = useTranslation();

	const queryClient = useQueryClient();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const projectsQuery = electronTrpc.migration.readV1Projects.useQuery();
	const workspacesQuery = electronTrpc.migration.readV1Workspaces.useQuery();
	const worktreesQuery = electronTrpc.migration.readV1Worktrees.useQuery();
	const foreignClaims = useForeignV1Claims(organizationId);

	const hostProjectListQuery = useQuery({
		queryKey: [...HOST_PROJECT_LIST_KEY_PREFIX, activeHostUrl],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.project.list.query();
		},
	});

	// Host-local list (host.db is the authority post-local-first; the old
	// cloud list never sees newly-adopted workspaces).
	const hostWorkspacesQuery = useQuery({
		queryKey: [...WORKSPACE_LIST_KEY, organizationId, activeHostUrl],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.workspace.list.query();
		},
	});

	const targetByV1Id = useMemo(
		() =>
			mapV1ProjectsToV2Targets(
				hostProjectListQuery.data ?? [],
				projectsQuery.data ?? [],
			),
		[hostProjectListQuery.data, projectsQuery.data],
	);

	const isImportedOnHost = useMemo(
		() => importedV1WorkspaceCheck(hostWorkspacesQuery.data ?? []),
		[hostWorkspacesQuery.data],
	);

	const importedRepositories = Array.from(
		new Map(
			Array.from(targetByV1Id.values(), (target) => [
				target.repositoryId,
				target,
			]),
		).values(),
	);

	const worktreeListQueries = useQueries({
		queries: importedRepositories.map(({ v2ProjectId, repositoryId }) => ({
			queryKey: [
				...WORKTREE_LIST_KEY_PREFIX,
				v2ProjectId,
				repositoryId,
				activeHostUrl,
			] as const,
			queryFn: async () => {
				const client = getHostServiceClientByUrl(activeHostUrl);
				const result =
					await client.workspaceCreation.listProjectWorktrees.query({
						projectId: v2ProjectId,
						repositoryId,
					});
				return result.worktrees;
			},
		})),
	});

	const validBranchesByRepositoryId = new Map<string, Set<string>>();
	importedRepositories.forEach(({ repositoryId }, index) => {
		const data = worktreeListQueries[index]?.data;
		if (!data) return;
		validBranchesByRepositoryId.set(
			repositoryId,
			new Set(data.map((w) => w.branch)),
		);
	});

	const isLoading =
		foreignClaims === null ||
		projectsQuery.isPending ||
		workspacesQuery.isPending ||
		worktreesQuery.isPending ||
		hostProjectListQuery.isPending ||
		hostWorkspacesQuery.isPending ||
		worktreeListQueries.some((q) => q.isPending);

	const [isRefreshing, setIsRefreshing] = useState(false);
	const refresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				projectsQuery.refetch(),
				workspacesQuery.refetch(),
				worktreesQuery.refetch(),
				hostProjectListQuery.refetch(),
				hostWorkspacesQuery.refetch(),
				queryClient.invalidateQueries({
					queryKey: WORKTREE_LIST_KEY_PREFIX,
				}),
			]);
		} finally {
			setIsRefreshing(false);
		}
	};

	const projectsById = new Map(
		(projectsQuery.data ?? []).map((p) => [p.id, p]),
	);
	const worktreesById = new Map(
		(worktreesQuery.data ?? []).map((w) => [w.id, w]),
	);
	const allWorkspaces = workspacesQuery.data ?? [];

	type VisibleWorkspace = {
		workspace: (typeof allWorkspaces)[number];
		v2ProjectId: string;
		repositoryId: string;
		multiRepo: boolean;
		alreadyImported: boolean;
		ownedElsewhere: boolean;
		worktreePath: string | undefined;
		baseBranch: string | null;
	};
	const visibleWorkspaces: VisibleWorkspace[] = [];
	for (const workspace of allWorkspaces) {
		const target = targetByV1Id.get(workspace.projectId);
		if (!target) continue;
		const { v2ProjectId, repositoryId, multiRepo } = target;

		const alreadyImported = isImportedOnHost({
			v2ProjectId,
			repositoryId,
			multiRepo,
			branch: workspace.branch,
		});
		if (!alreadyImported) {
			const validBranches = validBranchesByRepositoryId.get(repositoryId);
			if (validBranches !== undefined && !validBranches.has(workspace.branch)) {
				continue;
			}
		}
		const worktree = workspace.worktreeId
			? worktreesById.get(workspace.worktreeId)
			: undefined;
		visibleWorkspaces.push({
			workspace,
			v2ProjectId,
			repositoryId,
			multiRepo,
			alreadyImported,
			ownedElsewhere:
				!!foreignClaims && isForeignV1Workspace(workspace, foreignClaims),
			worktreePath: worktree?.path,
			baseBranch: worktree?.baseBranch ?? null,
		});
	}

	const [adoptStates, setAdoptStates] = useState<Map<string, AdoptStatus>>(
		() => new Map(),
	);
	const adoptStatesRef = useRef(adoptStates);
	adoptStatesRef.current = adoptStates;

	const updateAdoptStatus = useCallback(
		(workspaceId: string, status: AdoptStatus) => {
			setAdoptStates((prev) => {
				const next = new Map(prev);
				if (status.kind === "idle") {
					next.delete(workspaceId);
				} else {
					next.set(workspaceId, status);
				}
				return next;
			});
		},
		[],
	);

	const visibleWorkspacesRef = useRef<VisibleWorkspace[]>([]);

	const isPendingEntry = useCallback((entry: VisibleWorkspace) => {
		if (entry.alreadyImported || entry.ownedElsewhere) return false;
		const status = adoptStatesRef.current.get(entry.workspace.id) ?? IDLE;
		return status.kind === "idle" || status.kind === "error";
	}, []);

	const adoptWorkspace = useCallback(
		async (entry: VisibleWorkspace): Promise<string[]> => {
			const { workspace, v2ProjectId, worktreePath, baseBranch } = entry;
			const members = [entry];
			if (entry.multiRepo) {
				for (const other of visibleWorkspacesRef.current) {
					if (
						other.v2ProjectId === v2ProjectId &&
						other.workspace.branch === workspace.branch &&
						!members.some((m) => m.repositoryId === other.repositoryId) &&
						isPendingEntry(other)
					) {
						members.push(other);
					}
				}
			}
			const memberIds = members.map((m) => m.workspace.id);
			for (const id of memberIds) updateAdoptStatus(id, { kind: "running" });
			try {
				const client = getHostServiceClientByUrl(activeHostUrl);
				const adopted = await withV1MigrationRunLock(async () => {
					// The automatic pass may have adopted them while this waited.
					const ledger =
						await electronV1MigrationIpc.ledgerList(organizationId);
					const migratedV2IdByV1Id = new Map<string, string>();
					for (const row of ledger) {
						if (
							row.kind === "workspace" &&
							(row.status === "success" || row.status === "linked") &&
							row.v2Id
						) {
							migratedV2IdByV1Id.set(row.v1Id, row.v2Id);
						}
					}
					const pending = members.filter(
						(m) => !migratedV2IdByV1Id.has(m.workspace.id),
					);
					const [firstPending] = pending;
					if (!firstPending) {
						return {
							v2WorkspaceId: migratedV2IdByV1Id.get(workspace.id) ?? null,
							importedIds: memberIds,
						};
					}
					const alreadyMigratedIds = memberIds.filter((id) =>
						migratedV2IdByV1Id.has(id),
					);

					if (entry.multiRepo) {
						const result = await adoptV1WorkspaceGroupIntoMultiRepoProject(
							client,
							electronV1MigrationIpc.resolvePaths,
							{
								v2ProjectId,
								name: firstPending.workspace.name,
								members: pending.map((m) => ({
									repositoryId: m.repositoryId,
									worktreePath: m.worktreePath,
								})),
							},
						);
						if (!result) {
							return { v2WorkspaceId: null, importedIds: alreadyMigratedIds };
						}
						const adoptedMembers = pending.filter((m) =>
							result.repositoryIds.includes(m.repositoryId),
						);
						for (const m of adoptedMembers) {
							await recordV1MigrationOutcome(organizationId, {
								v1Id: m.workspace.id,
								kind: "workspace",
								status: "success",
								v2Id: result.workspace.id,
							});
						}
						return {
							v2WorkspaceId: result.workspace.id,
							importedIds: [
								...alreadyMigratedIds,
								...adoptedMembers.map((m) => m.workspace.id),
							],
						};
					}

					const gitWorktree = worktreePath
						? await findGitWorktreeAtFolder(
								client,
								electronV1MigrationIpc.resolvePaths,
								v2ProjectId,
								worktreePath,
								entry.repositoryId,
							)
						: null;
					const result = await adoptV1Workspace(client, {
						v2ProjectId,
						name: workspace.name,
						branch: gitWorktree?.branch ?? workspace.branch,
						worktreePath: gitWorktree?.path ?? worktreePath,
						baseBranch,
					});
					await recordV1MigrationOutcome(organizationId, {
						v1Id: workspace.id,
						kind: "workspace",
						status: "success",
						v2Id: result.workspace.id,
					});
					return {
						v2WorkspaceId: result.workspace.id,
						importedIds: memberIds,
					};
				});

				if (adopted.v2WorkspaceId) {
					ensureWorkspaceInSidebar(adopted.v2WorkspaceId, v2ProjectId);
				}
				for (const id of memberIds) {
					if (adopted.importedIds.includes(id)) {
						updateAdoptStatus(id, { kind: "imported" });
					} else if (id === workspace.id) {
						updateAdoptStatus(id, {
							kind: "error",
							message: translate(
								msg({
									message:
										"This workspace has no worktree that can move into a multi-repo workspace.",
								}),
							),
						});
					} else {
						updateAdoptStatus(id, IDLE);
					}
				}
				await queryClient.invalidateQueries({
					queryKey: WORKSPACE_LIST_KEY,
				});
				return memberIds;
			} catch (err) {
				const message = hostRefusalReason(errorMessage(err));
				for (const id of memberIds) {
					updateAdoptStatus(id, { kind: "error", message });
				}
				console.error("[v1-import] workspace adopt failed", {
					v1WorkspaceIds: memberIds,
					v2ProjectId,
					branch: workspace.branch,
					organizationId,
					err,
				});
				return memberIds;
			}
		},
		[
			activeHostUrl,
			ensureWorkspaceInSidebar,
			isPendingEntry,
			organizationId,
			queryClient,
			translate,
			updateAdoptStatus,
		],
	);

	const [adoptAllProgress, setAdoptAllProgress] = useState<{
		current: number;
		total: number;
	} | null>(null);

	const pendingEntries = visibleWorkspaces.filter((entry) => {
		if (entry.alreadyImported || entry.ownedElsewhere) return false;
		const status = adoptStates.get(entry.workspace.id) ?? IDLE;
		return status.kind === "idle" || status.kind === "error";
	});

	visibleWorkspacesRef.current = visibleWorkspaces;

	const adoptAll = useCallback(async () => {
		const queue = visibleWorkspacesRef.current.filter(isPendingEntry);
		if (queue.length === 0) return;
		const handled = new Set<string>();
		try {
			for (let i = 0; i < queue.length; i++) {
				const entry = queue[i];
				if (!entry || handled.has(entry.workspace.id)) continue;
				const current = adoptStatesRef.current.get(entry.workspace.id) ?? IDLE;
				if (current.kind === "running" || current.kind === "imported") {
					continue;
				}
				setAdoptAllProgress({ current: i, total: queue.length });
				for (const id of await adoptWorkspace(entry)) handled.add(id);
			}
		} finally {
			setAdoptAllProgress(null);
		}
	}, [adoptWorkspace, isPendingEntry]);

	const isAdoptingAll = adoptAllProgress !== null;
	const showAdoptAll = pendingEntries.length > 0 || isAdoptingAll;

	const headerAction = showAdoptAll ? (
		<Button
			type="button"
			size="sm"
			variant="default"
			onClick={() => {
				void adoptAll();
			}}
			disabled={isAdoptingAll || pendingEntries.length === 0}
			className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium tabular-nums"
		>
			{adoptAllProgress && <Spinner className="size-3" />}
			{adoptAllProgress
				? `Adopting ${adoptAllProgress.current + 1}/${adoptAllProgress.total}`
				: `Adopt all · ${pendingEntries.length}`}
		</Button>
	) : null;

	const grouped = new Map<
		string,
		{
			projectName: string;
			items: VisibleWorkspace[];
		}
	>();
	for (const entry of visibleWorkspaces) {
		const project = projectsById.get(entry.workspace.projectId);
		if (!project) continue;
		const bucket = grouped.get(entry.workspace.projectId) ?? {
			projectName: project.name,
			items: [],
		};
		bucket.items.push(entry);
		grouped.set(entry.workspace.projectId, bucket);
	}

	return (
		<ImportPageShell
			title={translate(msg({ message: "Bring over your workspaces" }))}
			description={translate(
				msg({
					message: "Adopt v1 workspaces under their imported v2 project.",
				}),
			)}
			isLoading={isLoading}
			itemCount={visibleWorkspaces.length}
			emptyMessage={
				targetByV1Id.size === 0
					? "Import a project on the Projects tab first to bring over its workspaces."
					: "No v1 workspaces left to import."
			}
			onRefresh={refresh}
			isRefreshing={isRefreshing}
			headerAction={headerAction}
		>
			{Array.from(grouped.entries()).map(([projectV1Id, group]) => (
				<div key={projectV1Id} className="mb-1.5 flex min-w-0 flex-col">
					<div
						className="truncate px-2.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70"
						title={group.projectName}
					>
						{group.projectName}
					</div>
					{group.items.map((entry) => (
						<WorkspaceRow
							key={entry.workspace.id}
							entry={entry}
							status={adoptStates.get(entry.workspace.id) ?? IDLE}
							disabled={isAdoptingAll}
							onAdopt={() => {
								void adoptWorkspace(entry);
							}}
						/>
					))}
				</div>
			))}
		</ImportPageShell>
	);
}

interface WorkspaceRowProps {
	entry: {
		workspace: { id: string; name: string; branch: string };
		alreadyImported: boolean;
		ownedElsewhere: boolean;
	};
	status: AdoptStatus;
	disabled: boolean;
	onAdopt: () => void;
}

function WorkspaceRow({ entry, status, disabled, onAdopt }: WorkspaceRowProps) {
	const { _: translate } = useTranslation();
	const { workspace, alreadyImported, ownedElsewhere } = entry;

	const action: RowAction = (() => {
		if (ownedElsewhere && !alreadyImported && status.kind === "idle") {
			return {
				kind: "blocked",
				reason: translate(
					msg({
						message:
							"Already brought over to another organization. Switch to it to see this workspace.",
					}),
				),
			};
		}
		if (status.kind === "running") {
			return { kind: "running", label: "Adopting…" };
		}
		if (alreadyImported || status.kind === "imported") {
			return { kind: "imported" };
		}
		if (status.kind === "error") {
			return disabled
				? { kind: "running", label: "Queued" }
				: { kind: "error", message: status.message, onRetry: onAdopt };
		}
		return {
			kind: "ready",
			label: "Adopt",
			onClick: onAdopt,
			disabled,
		};
	})();

	return (
		<ImportRow
			icon={<LuLayoutGrid className="size-3.5" strokeWidth={2} />}
			primary={workspace.name}
			secondary={workspace.branch}
			action={action}
		/>
	);
}
