import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { ProjectSnapshotPayload } from "@superset/workspace-client";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";

/** One tag folder's host-side presentation row. */
export interface HostTagSetting {
	tag: string;
	displayName: string | null;
	color: string | null;
	tabOrder: number | null;
}

/** One repository of a project on its host, sorted by name in `repositories`. */
export type HostRepository = ProjectSnapshotPayload["repositories"][number];

/** A project row as served by a host (`project.list`). */
export interface HostProjectRow {
	id: string;
	name: string;
	primaryRepositoryId: string;
	/** Sorted by name; the primary is marked with `isPrimary`, not moved. */
	repositories: HostRepository[];
	worktreeBaseDir: string | null;
	/** Custom icon data-URI, or null to fall back to the GitHub avatar. */
	icon: string | null;
	/** Accent color as a `#rrggbb` hex, or null for the default. */
	color: string | null;
	createdAt: number;
	updatedAt: number;
	/** @deprecated Mixed-version fallback; canonical reads use tagFolders. */
	tagSettings?: HostTagSetting[];
}

/**
 * Merged item returned by useHostProjects. One item per logical project —
 * legacy cloud-created projects share one id across hosts, so replicas
 * group on it; local-first projects are per-host by construction.
 */
export interface HostProjectItem {
	/** Grouping key. Today `id`; kept separate so a cloud link can join later. */
	projectKey: string;
	id: string;
	name: string;
	primaryRepositoryId: string;
	/** The local host's replica when it serves the project, else the first seen. */
	repositories: HostRepository[];
	/** Custom icon data-URI, or null to fall back to the GitHub avatar. */
	icon: string | null;
	/** Accent color as a `#rrggbb` hex, or null for the default. */
	color: string | null;
	/** Hosts that serve this project. */
	hostIds: string[];
	/** False when no serving host answered live (snapshot data only). */
	hostReachable: boolean;
	createdAt: number;
	updatedAt: number;
	/** @deprecated Mixed-version fallback; canonical reads use tagFolders. */
	tagSettings?: HostTagSetting[];
}

/** The primary repository, or undefined for a row with no repositories. */
export function getPrimaryRepository<
	Repository extends { id: string },
>(project: {
	primaryRepositoryId: string;
	repositories: Repository[];
}): Repository | undefined {
	const repositories = project.repositories ?? [];
	return (
		repositories.find(
			(repository) => repository.id === project.primaryRepositoryId,
		) ?? repositories[0]
	);
}

export interface HostProjectsQueryTarget {
	machineId: string;
	organizationId: string;
	/** Null when the host is known but unreachable (offline remote). */
	hostUrl: string | null;
	isLocal: boolean;
}

/** One host's unmerged project rows, retained for host-specific adapters. */
export interface HostProjectRowsResult {
	target: HostProjectsQueryTarget;
	rows: HostProjectRow[] | undefined;
	reachable: boolean;
}

export interface HostRowForTargets {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

export function getHostProjectsQueryKey(
	target: Pick<HostProjectsQueryTarget, "machineId" | "organizationId">,
) {
	// Host identity, never hostUrl — see getHostWorkspacesQueryKey.
	return [
		"host-service",
		"projects",
		"list",
		target.organizationId,
		target.machineId,
	] as const;
}

/** Same target derivation as useHostWorkspaces — one per known host. */
export function deriveHostProjectsQueryTargets({
	activeHostUrl,
	hosts,
	machineId,
	relayUrl,
	fallbackOrganizationId,
}: {
	activeHostUrl: string | null;
	hosts: HostRowForTargets[];
	machineId: string | null;
	relayUrl: string;
	/**
	 * Org id for the local-host fallback target when the hosts collection
	 * hasn't loaded yet — without it the persisted snapshot can't hydrate
	 * in exactly the cold-start window it exists for.
	 */
	fallbackOrganizationId?: string | null;
}): HostProjectsQueryTarget[] {
	const targets: HostProjectsQueryTarget[] = hosts.map((host) => {
		const isLocal = host.machineId === machineId;
		const hostUrl = isLocal
			? activeHostUrl
			: host.isOnline
				? `${relayUrl}/hosts/${buildHostRoutingKey(host.organizationId, host.machineId)}`
				: null;
		return {
			machineId: host.machineId,
			organizationId: host.organizationId,
			hostUrl,
			isLocal,
		};
	});

	if (
		machineId &&
		activeHostUrl &&
		!targets.some((target) => target.machineId === machineId)
	) {
		targets.push({
			machineId,
			organizationId: hosts[0]?.organizationId ?? fallbackOrganizationId ?? "",
			hostUrl: activeHostUrl,
			isLocal: true,
		});
	}

	return targets;
}

/** Keep the fields this hook exposes from a `project.list` row or event snapshot. */
export function toHostProjectRow(
	snapshot: ProjectSnapshotPayload,
	fallbackTagSettings?: HostTagSetting[],
): HostProjectRow {
	return {
		id: snapshot.id,
		name: snapshot.name,
		primaryRepositoryId: snapshot.primaryRepositoryId,
		repositories: snapshot.repositories,
		worktreeBaseDir: snapshot.worktreeBaseDir,
		icon: snapshot.icon,
		color: snapshot.color ?? null,
		createdAt: snapshot.createdAt,
		updatedAt: snapshot.updatedAt,
		tagSettings: snapshot.tagSettings ?? fallbackTagSettings,
	};
}

/** Rows from older hosts, and snapshots saved before projects had repositories, are dropped. */
export function isHostProjectRow(value: unknown): value is HostProjectRow {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Partial<HostProjectRow>;
	return (
		typeof row.id === "string" &&
		typeof row.primaryRepositoryId === "string" &&
		Array.isArray(row.repositories)
	);
}

const SNAPSHOT_KEY_PREFIX = "host-projects:v1";

function snapshotKey(organizationId: string, machineId: string): string {
	return `${SNAPSHOT_KEY_PREFIX}:${organizationId}:${machineId}`;
}

/** Last-seen per-host snapshots in IndexedDB (remote hosts only, like workspaces). */
export async function loadHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
): Promise<HostProjectRow[] | undefined> {
	if (!organizationId) return undefined;
	try {
		const rows = await idbGet<unknown>(snapshotKey(organizationId, machineId));
		return Array.isArray(rows) ? rows.filter(isHostProjectRow) : undefined;
	} catch {
		return undefined;
	}
}

export function saveHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
	rows: HostProjectRow[],
): void {
	if (!organizationId) return;
	void idbSet(snapshotKey(organizationId, machineId), rows).catch(() => {});
}

export function clearHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
): void {
	if (!organizationId) return;
	void idbDel(snapshotKey(organizationId, machineId)).catch(() => {});
}

// Serialize read-modify-write per snapshot key so rapid deletes can't
// interleave and lose a removal to a stale concurrent write.
const snapshotWriteChains = new Map<string, Promise<void>>();

/**
 * Drop one project from the persisted snapshot. Needed for deleted events
 * that arrive before the query cache hydrates — without this, the stale
 * snapshot would resurrect the deleted project on the next launch.
 */
export function removeFromHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
	projectId: string,
): Promise<void> {
	const key = snapshotKey(organizationId, machineId);
	const chained = (snapshotWriteChains.get(key) ?? Promise.resolve()).then(
		async () => {
			const rows = await loadHostProjectsSnapshot(organizationId, machineId);
			if (!Array.isArray(rows)) return;
			const next = rows.filter((row) => row.id !== projectId);
			if (next.length !== rows.length) {
				saveHostProjectsSnapshot(organizationId, machineId, next);
			}
		},
	);
	snapshotWriteChains.set(
		key,
		chained.catch(() => {}),
	);
	return chained;
}

/**
 * Apply a project:changed event to a host's cached list. Created/updated
 * upsert from the event's snapshot payload; deleted removes the row.
 */
export function applyProjectChangedEvent(
	rows: HostProjectRow[] | undefined,
	event: {
		eventType: "created" | "updated" | "deleted";
		project: ProjectSnapshotPayload | null;
	},
	projectId: string,
): HostProjectRow[] | undefined {
	if (event.eventType === "deleted") {
		if (!rows) return rows;
		const next = rows.filter((row) => row.id !== projectId);
		return next.length === rows.length ? rows : next;
	}
	const snapshot = event.project;
	if (!snapshot) return rows;
	const existing = rows?.find((row) => row.id === snapshot.id);
	// Old hosts publish settings on project snapshots. New hosts may retain
	// the field as a compatibility adapter; omission keeps the last value.
	const nextRow = toHostProjectRow(snapshot, existing?.tagSettings);
	if (!isHostProjectRow(nextRow)) return rows;
	if (!rows) return [nextRow];
	return existing
		? rows.map((row) => (row.id === nextRow.id ? nextRow : row))
		: [...rows, nextRow];
}

/**
 * Per-row union merge across hosts on `id`. Legacy cloud-created projects
 * share an id across machines, so their replicas collapse into one item;
 * the most recently updated replica wins shared fields and the local
 * host's replica wins the repositories, which are per machine.
 */
export function mergeHostProjects({
	hostResults,
}: {
	hostResults: HostProjectRowsResult[];
}): HostProjectItem[] {
	const byKey = new Map<string, HostProjectItem>();

	for (const result of hostResults) {
		if (!result.rows) continue;
		for (const row of result.rows) {
			const key = row.id;
			const existing = byKey.get(key);
			if (!existing) {
				byKey.set(key, {
					projectKey: key,
					id: row.id,
					name: row.name,
					primaryRepositoryId: row.primaryRepositoryId,
					repositories: row.repositories,
					icon: row.icon,
					color: row.color,
					hostIds: [result.target.machineId],
					hostReachable: result.reachable,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt,
					tagSettings: row.tagSettings,
				});
				continue;
			}
			existing.hostIds.push(result.target.machineId);
			existing.hostReachable = existing.hostReachable || result.reachable;
			if (row.updatedAt > existing.updatedAt) {
				existing.name = row.name;
				existing.updatedAt = row.updatedAt;
			}
			if (row.createdAt < existing.createdAt) {
				existing.createdAt = row.createdAt;
			}
			if (result.target.isLocal) {
				existing.primaryRepositoryId = row.primaryRepositoryId;
				existing.repositories = row.repositories;
				existing.icon = row.icon;
				existing.color = row.color;
			}
			if (
				row.tagSettings !== undefined &&
				(existing.tagSettings === undefined || result.target.isLocal)
			) {
				existing.tagSettings = row.tagSettings;
			}
		}
	}

	return Array.from(byKey.values());
}

/** One host's own row for a project; repository ids differ between hosts. */
export function findHostProjectRow(
	hostResults: HostProjectRowsResult[],
	hostId: string | null | undefined,
	projectId: string | null | undefined,
): HostProjectRow | undefined {
	if (!hostId || !projectId) return undefined;
	return hostResults
		.find((result) => result.target.machineId === hostId)
		?.rows?.find((row) => row.id === projectId);
}
