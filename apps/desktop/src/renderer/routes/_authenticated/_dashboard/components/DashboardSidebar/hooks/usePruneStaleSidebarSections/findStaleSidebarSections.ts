import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	SESSIONS_TAG_SCOPE,
	tagFolderScope,
} from "@superset/shared/workspace-tags";

/**
 * A stored sidebar section row is only a presentation cache (order, collapse,
 * local colour) for a tag folder; membership is the tag itself. When the last
 * workspace carrying the tag goes away — deleted in the app, by the CLI, by
 * an external cleanup, or on another machine — nothing else removes the row,
 * and it renders as an empty group forever. These helpers decide which rows
 * are stale so the sidebar can drop them, never touching any workspace's tags
 * (that is what "Delete group" does, and it must not run implicitly).
 */

/** A row younger than this is never pruned: its host-side setting or first
 * tagged member may still be in flight ("New group", a just-created
 * workspace). */
export const STALE_SECTION_MIN_AGE_MS = 5 * 60_000;

/** A row must look stale continuously for this long, across at least two
 * strictly-ready evaluations, before it is deleted. Absorbs optimistic tag
 * writes that roll back and refetch races. */
export const STALE_SECTION_CONFIRM_MS = 30_000;

export interface StaleSectionCandidateInput {
	sectionId: string;
	/** Folder scope: a project id or SESSIONS_TAG_SCOPE. */
	projectId: string;
	/** Null/absent = legacy folder; its migration owns it, never pruned here. */
	tag?: string | null;
	createdAt: Date | string | number;
}

/** Every ACTIVE (non-archived) host workspace, hidden-in-sidebar included. */
export interface StaleSectionWorkspaceInput {
	projectId: string | null;
	tags?: readonly string[] | null;
}

/** A host `tag_folder_settings` row: a folder kept on purpose. */
export interface StaleSectionFolderSettingInput {
	/** Folder scope: a project id or SESSIONS_TAG_SCOPE. */
	projectId: string;
	tag: string;
}

function folderKey(scope: string, tag: string): string {
	return `${scope}\u0000${tag}`;
}

function toEpochMs(value: Date | string | number): number {
	return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Stored rows whose (scope, tag) no active workspace carries and no host
 * folder setting keeps. Rows outside `isScopePrunable` (host not strictly
 * ready for that scope), legacy rows, and rows younger than `minAgeMs` are
 * never returned.
 */
export function findStaleSidebarSections<T extends StaleSectionCandidateInput>(
	sections: readonly T[],
	activeWorkspaces: readonly StaleSectionWorkspaceInput[],
	folderSettings: readonly StaleSectionFolderSettingInput[],
	options: {
		now: number;
		isScopePrunable: (scope: string) => boolean;
		minAgeMs?: number;
	},
): T[] {
	const minAgeMs = options.minAgeMs ?? STALE_SECTION_MIN_AGE_MS;
	const occupied = new Set<string>();
	for (const workspace of activeWorkspaces) {
		const scope = tagFolderScope(workspace.projectId);
		for (const tag of normalizeWorkspaceTags(workspace.tags)) {
			occupied.add(folderKey(scope, tag));
		}
	}
	const kept = new Set<string>();
	for (const setting of folderSettings) {
		const tag = normalizeWorkspaceTag(setting.tag);
		if (tag != null) kept.add(folderKey(setting.projectId, tag));
	}

	return sections.filter((section) => {
		const tag = normalizeWorkspaceTag(section.tag);
		if (tag == null) return false;
		if (!options.isScopePrunable(section.projectId)) return false;
		const key = folderKey(section.projectId, tag);
		if (occupied.has(key) || kept.has(key)) return false;
		const createdAt = toEpochMs(section.createdAt);
		// An unreadable timestamp is a pre-createdAt legacy row, not a new one.
		if (Number.isFinite(createdAt) && options.now - createdAt < minAgeMs) {
			return false;
		}
		return true;
	});
}

export type PruneHostStatus = "live" | "pending" | "error" | "offline";

export interface PruneReadinessInput {
	/** The stored sections collection finished loading. */
	sectionsReady: boolean;
	/** Host workspace fan-out settled, known-host list included. */
	workspacesReady: boolean;
	/** machineId → state of that host's live workspace list. */
	workspaceHostStatuses: ReadonlyMap<string, PruneHostStatus>;
	tagFoldersReady: boolean;
	/** machineId → state of that host's `tagFolders.list` read. */
	tagFolderHostStatuses: ReadonlyMap<string, PruneHostStatus>;
	projectsReady: boolean;
	/** machineId → state of that host's live project list. */
	projectHostStatuses: ReadonlyMap<string, PruneHostStatus>;
	/** Project id → machine ids serving it (from the host project lists). */
	projectHostIds: ReadonlyMap<string, readonly string[]>;
}

const isUnsettled = (status: PruneHostStatus) =>
	status === "pending" || status === "error";

/**
 * Strict readiness gate for pruning. Returns null when nothing may be pruned
 * at all: any input still loading, any reachable host pending or failing (a
 * failed read must never look like an empty host), or no live host. Otherwise
 * returns the per-scope predicate: a project scope is prunable only when every
 * host serving it answered live for workspaces, folder settings and projects;
 * an unknown project (no serving host found) is never prunable. Offline hosts
 * that don't serve the project don't block it.
 */
export function resolvePrunableScopes(
	input: PruneReadinessInput,
): ((scope: string) => boolean) | null {
	if (
		!input.sectionsReady ||
		!input.workspacesReady ||
		!input.tagFoldersReady ||
		!input.projectsReady
	) {
		return null;
	}
	const statusMaps = [
		input.workspaceHostStatuses,
		input.tagFolderHostStatuses,
		input.projectHostStatuses,
	];
	for (const statuses of statusMaps) {
		for (const status of statuses.values()) {
			if (isUnsettled(status)) return null;
		}
	}
	const anyLive = [...input.workspaceHostStatuses.values()].some(
		(status) => status === "live",
	);
	if (!anyLive) return null;

	const isHostLive = (hostId: string) =>
		input.workspaceHostStatuses.get(hostId) === "live" &&
		input.tagFolderHostStatuses.get(hostId) === "live" &&
		input.projectHostStatuses.get(hostId) === "live";

	return (scope) => {
		// Project-less sessions live on the hosts already required live above;
		// any reachable host failing would have returned null.
		if (scope === SESSIONS_TAG_SCOPE) return true;
		const hostIds = input.projectHostIds.get(scope);
		if (!hostIds || hostIds.length === 0) return false;
		return hostIds.every(isHostLive);
	};
}

/**
 * Debounces pruning across evaluations: a section is deleted only once it was
 * a candidate in a previous evaluation too and has stayed one for at least
 * `confirmMs`. Sections that stop being candidates are forgotten, so any
 * flicker of membership restarts the clock.
 */
export function advanceStaleSectionTracker(
	firstSeenStaleAt: ReadonlyMap<string, number>,
	candidateIds: readonly string[],
	now: number,
	confirmMs: number = STALE_SECTION_CONFIRM_MS,
): { next: Map<string, number>; toDelete: string[] } {
	const next = new Map<string, number>();
	const toDelete: string[] = [];
	for (const sectionId of candidateIds) {
		const firstSeen = firstSeenStaleAt.get(sectionId);
		if (firstSeen === undefined) {
			next.set(sectionId, now);
			continue;
		}
		if (now - firstSeen >= confirmMs) {
			toDelete.push(sectionId);
			continue;
		}
		next.set(sectionId, firstSeen);
	}
	return { next, toDelete };
}
