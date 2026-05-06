import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuLayoutGrid } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { ImportPageShell } from "../components/ImportPageShell";
import { ImportRow, type RowAction } from "../components/ImportRow";

interface ImportWorkspacesPageProps {
	organizationId: string;
	activeHostUrl: string;
}

interface AuditLogEntry {
	v2Id: string | null;
	status: string;
	reason: string | null;
}

const WORKTREE_LIST_KEY_PREFIX = ["v1-import", "projectWorktrees"] as const;
const WORKSPACE_CLOUD_LIST_KEY = ["v1-import", "workspaceCloudList"] as const;

function trpcCode(err: unknown): string | null {
	if (typeof err !== "object" || err === null) return null;
	const data = (err as { data?: unknown }).data;
	if (typeof data !== "object" || data === null) return null;
	const code = (data as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
}

export function ImportWorkspacesPage({
	organizationId,
	activeHostUrl,
}: ImportWorkspacesPageProps) {
	const queryClient = useQueryClient();
	const projectsQuery = electronTrpc.migration.readV1Projects.useQuery();
	const workspacesQuery = electronTrpc.migration.readV1Workspaces.useQuery();
	const worktreesQuery = electronTrpc.migration.readV1Worktrees.useQuery();
	const auditQuery = electronTrpc.migration.listState.useQuery({
		organizationId,
	});
	const cloudWorkspacesQuery = useQuery({
		queryKey: [...WORKSPACE_CLOUD_LIST_KEY, organizationId, activeHostUrl],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.workspace.cloudList.query();
		},
		retry: false,
	});

	const liveWorkspaceIds = useMemo(() => {
		if (!cloudWorkspacesQuery.data) return null;
		return new Set(cloudWorkspacesQuery.data.map((w) => w.id));
	}, [cloudWorkspacesQuery.data]);

	const projectAuditByV1Id = new Map<string, AuditLogEntry>();
	const workspaceAuditByV1Id = new Map<string, AuditLogEntry>();
	for (const row of auditQuery.data ?? []) {
		const entry: AuditLogEntry = {
			v2Id: row.v2Id,
			status: row.status,
			reason: row.reason,
		};
		if (row.kind === "project") projectAuditByV1Id.set(row.v1Id, entry);
		else if (row.kind === "workspace")
			workspaceAuditByV1Id.set(row.v1Id, entry);
	}

	// Live `git worktree list` per imported v2 project — used to filter out
	// v1 workspaces whose branch no longer has a worktree (folder deleted,
	// branch pruned, etc.) so we don't surface guaranteed-to-fail rows.
	const importedV2ProjectIds = Array.from(projectAuditByV1Id.values())
		.filter(
			(entry) =>
				!!entry.v2Id &&
				(entry.status === "success" || entry.status === "linked"),
		)
		.map((entry) => entry.v2Id as string);

	const worktreeListQueries = useQueries({
		queries: importedV2ProjectIds.map((v2ProjectId) => ({
			queryKey: [
				...WORKTREE_LIST_KEY_PREFIX,
				v2ProjectId,
				activeHostUrl,
			] as const,
			queryFn: async () => {
				const client = getHostServiceClientByUrl(activeHostUrl);
				const result =
					await client.workspaceCreation.listProjectWorktrees.query({
						projectId: v2ProjectId,
					});
				return result.worktrees;
			},
			retry: false,
		})),
	});

	const validBranchesByV2ProjectId = new Map<string, Set<string>>();
	importedV2ProjectIds.forEach((v2ProjectId, index) => {
		const data = worktreeListQueries[index]?.data;
		if (!data) return;
		validBranchesByV2ProjectId.set(
			v2ProjectId,
			new Set(data.map((w) => w.branch)),
		);
	});

	const isLoading =
		projectsQuery.isPending ||
		workspacesQuery.isPending ||
		worktreesQuery.isPending ||
		auditQuery.isPending ||
		worktreeListQueries.some((q) => q.isPending);

	const [isRefreshing, setIsRefreshing] = useState(false);
	const refresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				projectsQuery.refetch(),
				workspacesQuery.refetch(),
				worktreesQuery.refetch(),
				auditQuery.refetch(),
				cloudWorkspacesQuery.refetch(),
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

	const visibleWorkspaces: typeof allWorkspaces = [];
	for (const workspace of allWorkspaces) {
		const projAudit = projectAuditByV1Id.get(workspace.projectId);
		const parentImported =
			!!projAudit?.v2Id &&
			(projAudit.status === "success" || projAudit.status === "linked");
		// Only surface workspaces whose v1 project has already been brought
		// over to v2 — workspaces under un-imported projects are useless
		// rows.
		if (!parentImported) continue;

		const wsAudit = workspaceAuditByV1Id.get(workspace.id);
		// Audit rows can be ghosts: status=success but cloud no longer has
		// the v2 workspace. Only treat as "already imported" when the cloud
		// list confirms it (or when the cloud list hasn't loaded yet, in
		// which case we trust audit until proven otherwise).
		const alreadyImported =
			wsAudit?.status === "success" &&
			(liveWorkspaceIds === null ||
				(!!wsAudit.v2Id && liveWorkspaceIds.has(wsAudit.v2Id)));
		if (!alreadyImported && projAudit?.v2Id) {
			const validBranches = validBranchesByV2ProjectId.get(projAudit.v2Id);
			if (validBranches !== undefined && !validBranches.has(workspace.branch)) {
				continue;
			}
		}
		visibleWorkspaces.push(workspace);
	}

	const grouped = new Map<
		string,
		{
			projectName: string;
			items: typeof visibleWorkspaces;
		}
	>();
	for (const workspace of visibleWorkspaces) {
		const project = projectsById.get(workspace.projectId);
		if (!project) continue;
		const bucket = grouped.get(workspace.projectId) ?? {
			projectName: project.name,
			items: [],
		};
		bucket.items.push(workspace);
		grouped.set(workspace.projectId, bucket);
	}

	return (
		<ImportPageShell
			title="Bring over your workspaces"
			description="Adopt v1 workspaces under their imported v2 project."
			isLoading={isLoading}
			itemCount={visibleWorkspaces.length}
			emptyMessage={
				importedV2ProjectIds.length === 0
					? "Import a project on the Projects tab first to bring over its workspaces."
					: "No v1 workspaces left to import."
			}
			onRefresh={refresh}
			isRefreshing={isRefreshing}
		>
			{Array.from(grouped.entries()).map(([projectV1Id, group]) => (
				<div key={projectV1Id} className="mb-2 flex min-w-0 flex-col">
					<div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						{group.projectName}
					</div>
					{group.items.map((workspace) => (
						<WorkspaceRow
							key={workspace.id}
							workspace={workspace}
							worktreePath={
								workspace.worktreeId
									? worktreesById.get(workspace.worktreeId)?.path
									: undefined
							}
							baseBranch={
								workspace.worktreeId
									? (worktreesById.get(workspace.worktreeId)?.baseBranch ??
										null)
									: null
							}
							projectAudit={projectAuditByV1Id.get(workspace.projectId)}
							workspaceAudit={workspaceAuditByV1Id.get(workspace.id)}
							liveWorkspaceIds={liveWorkspaceIds}
							organizationId={organizationId}
							activeHostUrl={activeHostUrl}
						/>
					))}
				</div>
			))}
		</ImportPageShell>
	);
}

interface WorkspaceRowProps {
	workspace: {
		id: string;
		name: string;
		branch: string;
		projectId: string;
	};
	worktreePath: string | undefined;
	baseBranch: string | null;
	projectAudit: AuditLogEntry | undefined;
	workspaceAudit: AuditLogEntry | undefined;
	/** Live cloud workspace ids in the org. `null` while still loading. */
	liveWorkspaceIds: Set<string> | null;
	organizationId: string;
	activeHostUrl: string;
}

function WorkspaceRow({
	workspace,
	worktreePath,
	baseBranch,
	projectAudit,
	workspaceAudit,
	liveWorkspaceIds,
	organizationId,
	activeHostUrl,
}: WorkspaceRowProps) {
	const queryClient = useQueryClient();
	const upsertState = electronTrpc.migration.upsertState.useMutation();
	const trpcUtils = electronTrpc.useUtils();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const [running, setRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const parentImported =
		projectAudit !== undefined &&
		projectAudit.v2Id !== null &&
		(projectAudit.status === "success" || projectAudit.status === "linked");
	const v2ProjectId = parentImported ? (projectAudit?.v2Id ?? null) : null;

	// Same ghost-detection as page-level filter: audit success is a lie if
	// cloud confirms the v2 workspace is gone.
	const auditClaimsImported =
		workspaceAudit !== undefined && workspaceAudit.status === "success";
	const auditImported =
		auditClaimsImported &&
		(liveWorkspaceIds === null ||
			(!!workspaceAudit?.v2Id && liveWorkspaceIds.has(workspaceAudit.v2Id)));
	const auditError =
		workspaceAudit !== undefined && workspaceAudit.status === "error"
			? workspaceAudit.reason
			: null;

	const runImport = async () => {
		if (!v2ProjectId) return;
		setRunning(true);
		setErrorMessage(null);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const adoptArgs = {
				projectId: v2ProjectId,
				workspaceName: workspace.name,
				branch: workspace.branch,
				baseBranch: baseBranch ?? undefined,
				existingWorkspaceId: workspaceAudit?.v2Id ?? undefined,
			};
			let result: Awaited<
				ReturnType<typeof client.workspaceCreation.adopt.mutate>
			>;
			try {
				result = await client.workspaceCreation.adopt.mutate({
					...adoptArgs,
					worktreePath,
				});
			} catch (err) {
				// v1's worktree row can be stale (folder moved/deleted) while git still
				// has the branch registered at the canonical worktree path. Retry by
				// branch before giving up.
				if (worktreePath && trpcCode(err) === "NOT_FOUND") {
					result = await client.workspaceCreation.adopt.mutate(adoptArgs);
				} else {
					throw err;
				}
			}

			await upsertState.mutateAsync({
				v1Id: workspace.id,
				kind: "workspace",
				v2Id: result.workspace.id,
				organizationId,
				status: "success",
				reason: null,
			});

			ensureWorkspaceInSidebar(result.workspace.id, v2ProjectId);
			await trpcUtils.migration.listState.invalidate({ organizationId });
			// Without this, the freshly-adopted workspace isn't in the
			// cached cloud-list snapshot, so the audit-ghost detector flips
			// the row from "Imported" back to a fresh Adopt button.
			await queryClient.invalidateQueries({
				queryKey: WORKSPACE_CLOUD_LIST_KEY,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setErrorMessage(message);
			await upsertState
				.mutateAsync({
					v1Id: workspace.id,
					kind: "workspace",
					v2Id: null,
					organizationId,
					status: "error",
					reason: message,
				})
				.catch((auditErr) => {
					console.warn(
						"[v1-import] failed to record workspace adopt error in audit",
						{ workspaceId: workspace.id, auditErr },
					);
				});
			await trpcUtils.migration.listState.invalidate({ organizationId });
		} finally {
			setRunning(false);
		}
	};

	const action: RowAction = (() => {
		if (running) return { kind: "running" };
		if (auditImported) return { kind: "imported" };
		if (!parentImported) {
			return {
				kind: "blocked",
				reason: "Import the project on the Projects tab first.",
			};
		}
		if (errorMessage) {
			return { kind: "error", message: errorMessage, onRetry: runImport };
		}
		if (auditError) {
			return { kind: "error", message: auditError, onRetry: runImport };
		}
		return { kind: "ready", label: "Adopt", onClick: runImport };
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
