import { TabVisibilityContext } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import {
	memo,
	startTransition,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import {
	type CloudWorkspaceRow,
	useCloudWorkspaces,
} from "renderer/hooks/useCloudWorkspaces";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	ScreenActiveContext,
	ScreenShownContext,
	useIsScreenActive,
} from "renderer/lib/screen-active";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { WorkspaceNotFoundState } from "renderer/routes/_authenticated/_dashboard/components/WorkspaceNotFoundState";
import { useUnarchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useUnarchiveCloudWorkspace";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import {
	type KeptWorkspace as KeptWorkspaceEntry,
	keptWorkspaceClassName,
	keptWorkspacesStore,
} from "renderer/routes/_authenticated/_dashboard/stores/keptWorkspacesStore";
import { setPressedWorkspaceId } from "renderer/routes/_authenticated/_dashboard/stores/pressedWorkspaceStore";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { useWorkspaceTransactionsStore } from "renderer/stores/workspace-creates";
import { CloudWorkspaceArchivedState } from "../components/CloudWorkspaceArchivedState";
import { CloudWorkspaceProvisioningState } from "../components/CloudWorkspaceProvisioningState";
import { WorkspaceCreateErrorState } from "../components/WorkspaceCreateErrorState";
import { WorkspaceCreatingState } from "../components/WorkspaceCreatingState";
import { WorkspaceHostIncompatibleState } from "../components/WorkspaceHostIncompatibleState";
import { useArchivedCloudWorkspace } from "../hooks/useArchivedCloudWorkspace";
import { useRemoteHostStatus } from "../hooks/useRemoteHostStatus";
import { useWorkspaceMissVerdict } from "../hooks/useWorkspaceMissVerdict";
import { WorkspaceProvider } from "../providers/WorkspaceProvider";
import { StoredCloudChat } from "./components/StoredCloudChat";
import { V2WorkspacePage } from "./page";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId",
)({
	component: V2WorkspaceLayout,
});

function V2WorkspaceLayout() {
	const { workspaceId } = Route.useParams();
	const [kept, setKept] = useState(keptWorkspacesStore.get);
	// Trees kept from before this route mounted come back one per idle period:
	// all at once stalls the first paint. Later prewarms mount right away.
	const [pendingIds, setPendingIds] = useState(
		() =>
			new Set(
				keptWorkspacesStore
					.get()
					.map((entry) => entry.id)
					.filter((id) => id !== workspaceId),
			),
	);
	const { workspaces: hostWorkspaces, isReady } = useHostWorkspaces();
	useEffect(() => {
		if (!isReady) return;
		const known = new Set(hostWorkspaces.map((workspace) => workspace.id));
		keptWorkspacesStore.prewarmRecent((id) => known.has(id));
	}, [isReady, hostWorkspaces]);
	useEffect(
		() =>
			keptWorkspacesStore.subscribe(() =>
				startTransition(() => setKept(keptWorkspacesStore.get())),
			),
		[],
	);
	useEffect(() => {
		keptWorkspacesStore.visit(workspaceId);
		setPressedWorkspaceId(null);
		setPendingIds((ids) => {
			if (!ids.has(workspaceId)) return ids;
			const next = new Set(ids);
			next.delete(workspaceId);
			return next;
		});
	}, [workspaceId]);
	const nextToMount = kept.find((entry) => pendingIds.has(entry.id))?.id;
	useEffect(() => {
		if (!nextToMount) return;
		const handle = requestIdleCallback(
			() =>
				startTransition(() =>
					setPendingIds((ids) => {
						const next = new Set(ids);
						next.delete(nextToMount);
						return next;
					}),
				),
			{ timeout: 1_000 },
		);
		return () => cancelIdleCallback(handle);
	}, [nextToMount]);

	const rendered: KeptWorkspaceEntry[] = kept.filter(
		(entry) => entry.id === workspaceId || !pendingIds.has(entry.id),
	);
	if (!rendered.some((entry) => entry.id === workspaceId)) {
		rendered.push({ id: workspaceId, usedAt: Date.now(), shown: true });
	}
	return rendered.map((entry) => {
		const isActive = entry.id === workspaceId;
		return (
			<div
				key={entry.id}
				ref={(element) => keptWorkspacesStore.register(entry.id, element)}
				inert={!isActive}
				className={keptWorkspaceClassName(isActive)}
			>
				<ScreenActiveContext.Provider value={isActive}>
					<ScreenShownContext.Provider value={isActive || entry.shown}>
						<TabVisibilityContext.Provider value={isActive || !entry.shown}>
							<KeptWorkspace workspaceId={entry.id} />
						</TabVisibilityContext.Provider>
					</ScreenShownContext.Provider>
				</ScreenActiveContext.Provider>
			</div>
		);
	});
}

const KeptWorkspace = memo(function KeptWorkspace({
	workspaceId,
}: {
	workspaceId: string;
}) {
	return <WorkspaceRouteBody workspaceId={workspaceId} />;
});

function WorkspaceRouteBody({ workspaceId }: { workspaceId: string }) {
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const pendingTransaction = useWorkspaceTransactionsStore((state) =>
		workspaceId ? (state.byWorkspaceId[workspaceId] ?? null) : null,
	);
	// The create transaction clears when the workspaces.create mutation
	// settles — not when the host-served row first arrives, which happens
	// mid-create before agent/terminal panes are seeded.
	const isCreatePending = pendingTransaction?.type === "insert";

	const { toggleShowPresetsBar } = useV2UserPreferences();
	const isScreenActive = useIsScreenActive();
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		enabled: isScreenActive,
		onData: (event) => {
			if (event.type === "toggle-presets-bar") {
				toggleShowPresetsBar();
			}
		},
	});

	const {
		workspaces: hostWorkspaces,
		isReady,
		hostsSettled,
		cache,
	} = useHostWorkspaces();
	const hostWorkspace = useMemo(
		() =>
			workspaceId != null
				? (hostWorkspaces.find((candidate) => candidate.id === workspaceId) ??
					null)
				: null,
		[hostWorkspaces, workspaceId],
	);
	// The open workspace's sandbox joins the fan-out as its own host, so a
	// cloud workspace is found the same way as any other — but it has no
	// v2_hosts row for the remote version gate to check.
	const { targets: sandboxes } = useSandboxAccess();
	const sandbox =
		sandboxes.find((candidate) => candidate.workspaceId === workspaceId) ??
		null;
	const isCloud = sandbox !== null;
	// The cloud row exists from the moment the workspace is created, which is
	// well before there is a sandbox to serve it.
	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();
	const cloudWorkspace =
		cloudWorkspaces.find((row) => row.id === workspaceId) ?? null;
	// A ready cloud workspace opens on its own row; the box's row, when the
	// fan-out has it, is the same workspace with live fields. The box seeds its
	// row with a placeholder name: the cloud row owns the real one.
	const workspace = useMemo(() => {
		if (hostWorkspace) {
			return cloudWorkspace
				? { ...hostWorkspace, name: cloudWorkspace.name }
				: hostWorkspace;
		}
		return isCloud && cloudWorkspace?.status === "ready"
			? hostShapedCloudWorkspace(cloudWorkspace)
			: null;
	}, [hostWorkspace, isCloud, cloudWorkspace]);
	const archivedCloudWorkspace = useArchivedCloudWorkspace(
		workspaceId,
		!workspace && !cloudWorkspace,
	);
	const unarchive = useUnarchiveCloudWorkspace();
	const { data: failedEntries } = useLiveQuery(
		(q) =>
			q
				.from({ failed: collections.failedWorkspaceCreates })
				.where(({ failed }) => eq(failed.id, workspaceId ?? "")),
		[collections, workspaceId],
	);
	const failedEntry = failedEntries?.[0] ?? null;

	const setCloudInSidebar = useCloudSidebarStore((state) => state.setInSidebar);
	const lastEnsuredWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (
			!isScreenActive ||
			!workspace ||
			lastEnsuredWorkspaceIdRef.current === workspace.id
		)
			return;
		lastEnsuredWorkspaceIdRef.current = workspace.id;
		ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [ensureWorkspaceInSidebar, workspace, isScreenActive]);

	const lastShownCloudWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (
			!isScreenActive ||
			!workspace ||
			!cloudWorkspace ||
			lastShownCloudWorkspaceIdRef.current === cloudWorkspace.id
		)
			return;
		lastShownCloudWorkspaceIdRef.current = cloudWorkspace.id;
		setCloudInSidebar(cloudWorkspace.organizationId, cloudWorkspace.id, true);
	}, [setCloudInSidebar, workspace, cloudWorkspace, isScreenActive]);

	// Sandboxes ship with the app's own host-service build, so the remote
	// version gate has nothing to check and no host row to check it against.
	const hostStatus = useRemoteHostStatus(isCloud ? null : workspace);

	// "Not found" is a verdict, not a cache read: a CLI-created workspace can
	// trail its own deep link (missed broadcast, second host-service instance,
	// stale boot snapshot), so the route forces a refetch and waits for it —
	// bounded — before declaring the id missing.
	const missConfirmed = useWorkspaceMissVerdict(
		{
			workspaceId,
			workspaceFound: workspace !== null,
			suspended: pendingTransaction !== null || failedEntry !== null,
			hostsEnumerated: hostsSettled,
			hasLiveTargets: cache.hasLiveTargets,
			mirrorSettled: isReady,
		},
		cache.refetchAll,
	);
	const isGone =
		!workspace &&
		!cloudWorkspace &&
		(missConfirmed || Boolean(archivedCloudWorkspace?.deletedAt));
	useEffect(() => {
		if (isGone && !isScreenActive) keptWorkspacesStore.forget(workspaceId);
	}, [isGone, isScreenActive, workspaceId]);

	// A `ready` row only means the box has started booting. Its address request
	// is batched with the wake, which waits for host-service to answer.
	if (!workspace && cloudWorkspace) {
		const provisioning = (
			<CloudWorkspaceProvisioningState
				workspaceId={cloudWorkspace.id}
				name={cloudWorkspace.name}
				status={cloudWorkspace.status}
			/>
		);
		return (
			<StateScreenShell>
				{cloudWorkspace.status === "ready" ? (
					<StoredCloudChat
						fallback={provisioning}
						workspaceId={cloudWorkspace.id}
					/>
				) : (
					provisioning
				)}
			</StateScreenShell>
		);
	}

	if (!workspace && archivedCloudWorkspace?.deletedAt) {
		return (
			<StateScreenShell>
				<CloudWorkspaceArchivedState
					name={archivedCloudWorkspace.name}
					archivedAt={archivedCloudWorkspace.deletedAt}
					onUnarchive={() => unarchive(archivedCloudWorkspace.id)}
				/>
			</StateScreenShell>
		);
	}

	if (!workspace) {
		if (failedEntry) {
			return (
				<StateScreenShell>
					<WorkspaceCreateErrorState entry={failedEntry} />
				</StateScreenShell>
			);
		}
		if (!missConfirmed) {
			return <StateScreenShell>{null}</StateScreenShell>;
		}
		return (
			<StateScreenShell>
				<WorkspaceNotFoundState
					workspaceId={workspaceId}
					browseTo="/v2-workspaces"
				/>
			</StateScreenShell>
		);
	}

	if (isCreatePending) {
		return (
			<StateScreenShell>
				<WorkspaceCreatingState
					name={workspace.name}
					branch={workspace.branch}
					startedAt={pendingTransaction.createdAt.getTime()}
					workspaceReady={
						hostWorkspace ? Boolean(hostWorkspace.worktreePath) : true
					}
					isSession={workspace.type === "session"}
				/>
			</StateScreenShell>
		);
	}

	if (!isCloud) {
		if (hostStatus.status === "incompatible") {
			return (
				<StateScreenShell>
					<WorkspaceHostIncompatibleState
						hostId={hostStatus.hostId}
						hostUrl={hostStatus.hostUrl}
						hostName={hostStatus.hostName}
						hostVersion={hostStatus.hostVersion}
						minVersion={hostStatus.minVersion}
						installSource={hostStatus.installSource}
					/>
				</StateScreenShell>
			);
		}
		if (hostStatus.status === "loading") {
			return <StateScreenShell>{null}</StateScreenShell>;
		}
	}

	return (
		<WorkspaceProvider workspace={workspace}>
			<V2WorkspacePage />
		</WorkspaceProvider>
	);
}

function hostShapedCloudWorkspace(row: CloudWorkspaceRow): HostShapedWorkspace {
	return {
		id: row.id,
		organizationId: row.organizationId,
		hostId: row.id,
		name: row.name,
		branch: row.branch,
		projectId: null,
		type: "local",
		createdByUserId: row.createdByUserId,
		taskId: null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
