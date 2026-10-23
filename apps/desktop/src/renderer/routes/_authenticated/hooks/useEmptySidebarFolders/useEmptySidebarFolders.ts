import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import {
	normalizeWorkspaceTag,
	SESSIONS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	type FindOrphanedTagFoldersInput,
	findOrphanedTagFolders,
	laneProjectIdForScope,
	type OrphanedTagFolder,
	type UnverifiedTagFolder,
	type UnverifiedTagFolderReason,
	useTagFolderContext,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { refreshPruneSources } from "./utils/refreshPruneSources";

const SOURCE_REFETCH_TIMEOUT_MS = 5_000;
const SOURCE_SETTLE_MS = 1_500;
const SOURCE_POLL_MS = 50;

export interface EmptySidebarFolder {
	scope: string;
	/** Null for the Sessions lane. */
	projectId: string | null;
	projectName: string | null;
	tag: string;
	name: string;
}

export interface FailedSidebarFolder extends EmptySidebarFolder {
	error: string;
}

export interface SkippedSidebarFolder extends EmptySidebarFolder {
	reason: UnverifiedTagFolderReason;
}

export interface RemoveEmptySidebarFoldersResult {
	/** Removed, or on a dry run the folders that would be. */
	removed: EmptySidebarFolder[];
	/** Looked empty, but could not be removed safely yet; `reason` says why. */
	skipped: SkippedSidebarFolder[];
	failed: FailedSidebarFolder[];
}

export interface RemoveEmptySidebarFoldersOptions {
	projectId?: string;
	dryRun?: boolean;
}

interface FolderGroup {
	folder: EmptySidebarFolder;
	sectionIds: string[];
}

function hasErrorCode(error: unknown, code: string): boolean {
	return (error as { data?: { code?: unknown } } | null)?.data?.code === code;
}

/** Drops one folder's presentation on one host. A host without the scope has none to drop. */
async function deleteHostTagSetting(
	url: string,
	scope: string,
	tag: string,
): Promise<void> {
	const client = getHostServiceClientByUrl(url);
	try {
		await client.tagFolders.delete.mutate({ scope, tag });
	} catch (error) {
		if (hasErrorCode(error, "NOT_FOUND")) return;
		if (scope === SESSIONS_TAG_SCOPE || !isMissingProcedureError(error)) {
			throw error;
		}
		try {
			await client.project.deleteTagSetting.mutate({ projectId: scope, tag });
		} catch (legacyError) {
			if (!hasErrorCode(legacyError, "NOT_FOUND")) throw legacyError;
		}
	}
}

/**
 * Stored folders that no workspace carries the tag of, and the purge that
 * removes their presentation: the local row and the host
 * `tag_folder_settings` row. It never changes a workspace's tags, so a
 * folder that comes back later is a new, plain one.
 */
export function useEmptySidebarFolders() {
	const collections = useCollections();
	const {
		workspaces: hostWorkspaces,
		hostReads,
		rosterLive,
		cache,
	} = useHostWorkspaces();
	const { workspaces: cloudWorkspaces, isLive: cloudLive } =
		useCloudWorkspaces();
	const { projects: hostProjects, hostResults: projectHostResults } =
		useHostProjects();
	const { activeHostUrl } = useLocalHostService();
	const tagFolderContext = useTagFolderContext();

	const { data: sections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.select(({ sidebarSections }) => ({
					sectionId: sidebarSections.sectionId,
					projectId: sidebarSections.projectId,
					name: sidebarSections.name,
					tag: sidebarSections.tag,
				})),
		[collections],
	);
	const { data: placements = [] } = useLiveQuery(
		(q) =>
			q
				.from({ rows: collections.v2WorkspaceLocalState })
				.select(({ rows }) => ({
					workspaceId: rows.workspaceId,
					projectId: rows.sidebarState.projectId,
				})),
		[collections],
	);

	const findInput = useMemo<FindOrphanedTagFoldersInput>(() => {
		const placedProjectIdById = new Map(
			placements.map((row) => [row.workspaceId, row.projectId]),
		);
		const projectIdsByHost = new Map(
			projectHostResults.map((result) => [
				result.target.machineId,
				result.rows?.map((project) => project.id) ?? null,
			]),
		);
		const projectsLiveByHost = new Map(
			projectHostResults.map((result) => [
				result.target.machineId,
				result.reachable,
			]),
		);
		return {
			sections,
			workspaces: [
				...hostWorkspaces
					.filter((workspace) => !cache.isSandboxHost(workspace.hostId))
					.map((workspace) => ({
						id: workspace.id,
						projectId: workspace.projectId,
						tags: workspace.tags,
					})),
				...(cloudWorkspaces ?? []).map((workspace) => ({
					id: workspace.id,
					projectId: placedProjectIdById.get(workspace.id),
					tags: workspace.tags,
				})),
			],
			hostReads: hostReads.map((read) => ({
				isLocal: read.isLocal,
				live: read.live,
				projectIds: projectIdsByHost.get(read.machineId) ?? null,
				projectsLive: projectsLiveByHost.get(read.machineId) ?? false,
			})),
			rosterLive,
			cloudLive,
			hiddenTagsByProject: tagFolderContext.hiddenTagsByProject,
			sessionsSettingHostKnown: activeHostUrl !== null,
		};
	}, [
		activeHostUrl,
		cache,
		cloudLive,
		cloudWorkspaces,
		hostReads,
		hostWorkspaces,
		placements,
		projectHostResults,
		rosterLive,
		sections,
		tagFolderContext.hiddenTagsByProject,
	]);

	const groupFolders = useCallback(
		(folders: readonly OrphanedTagFolder[]): FolderGroup[] => {
			const groups = new Map<string, FolderGroup>();
			for (const folder of folders) {
				const key = `${folder.scope}\u0000${folder.tag}`;
				const existing = groups.get(key);
				if (existing) {
					existing.sectionIds.push(folder.sectionId);
					continue;
				}
				const setting = tagFolderContext.tagSettings.find(
					(item) =>
						item.projectId === folder.scope &&
						normalizeWorkspaceTag(item.tag) === folder.tag,
				);
				groups.set(key, {
					sectionIds: [folder.sectionId],
					folder: {
						scope: folder.scope,
						projectId: laneProjectIdForScope(folder.scope),
						projectName:
							hostProjects.find(
								(project) => project.projectKey === folder.scope,
							)?.name ?? null,
						tag: folder.tag,
						name: setting?.displayName ?? folder.name,
					},
				});
			}
			return [...groups.values()];
		},
		[hostProjects, tagFolderContext.tagSettings],
	);

	const toSkipped = useCallback(
		(folders: readonly UnverifiedTagFolder[]): SkippedSidebarFolder[] =>
			groupFolders(folders).map(({ folder }) => ({
				...folder,
				reason:
					folders.find(
						(item) => item.scope === folder.scope && item.tag === folder.tag,
					)?.reason ?? "unanswered",
			})),
		[groupFolders],
	);

	const { emptyFolders, unverifiedFolders } = useMemo(() => {
		const found = findOrphanedTagFolders(findInput);
		return {
			emptyFolders: groupFolders(found.orphaned).map(({ folder }) => folder),
			unverifiedFolders: toSkipped(found.unverified),
		};
	}, [findInput, groupFolders, toSkipped]);

	/**
	 * A project's folders live on every host serving it; Sessions folders on
	 * the active host. Null when one of those hosts cannot be reached, so the
	 * caller never reads "no hosts" as "nothing to delete".
	 */
	const resolveSettingHostUrls = useCallback(
		(scope: string): string[] | null => {
			if (scope === SESSIONS_TAG_SCOPE) {
				return activeHostUrl ? [activeHostUrl] : null;
			}
			const project = hostProjects.find((item) => item.projectKey === scope);
			const urls = (project?.hostIds ?? []).map((hostId) =>
				cache.resolveHostUrl(hostId),
			);
			return urls.every((url): url is string => url != null) ? urls : null;
		},
		[activeHostUrl, cache, hostProjects],
	);

	const cloudUtils = cloudTrpc.useUtils();
	const queryClient = useQueryClient();
	// A prune refetches stale sources and decides from the render that
	// carries their data, so it reads everything through this ref.
	const latestRef = useRef({
		findInput,
		cache,
		groupFolders,
		resolveSettingHostUrls,
		toSkipped,
	});
	latestRef.current = {
		findInput,
		cache,
		groupFolders,
		resolveSettingHostUrls,
		toSkipped,
	};

	const removeEmptyFolders = useCallback(
		async ({
			projectId,
			dryRun = false,
		}: RemoveEmptySidebarFoldersOptions = {}): Promise<RemoveEmptySidebarFoldersResult> => {
			const input = await refreshPruneSources({
				current: latestRef.current.findInput,
				readLatest: () => latestRef.current.findInput,
				refetch: {
					roster: () => cloudUtils.host.roster.refetch(),
					cloud: () => cloudUtils.cloudWorkspace.list.refetch(),
					hosts: () =>
						Promise.all([
							latestRef.current.cache.refetchAll(),
							queryClient.refetchQueries({
								queryKey: ["host-service", "projects", "list"],
							}),
						]),
				},
				timeoutMs: SOURCE_REFETCH_TIMEOUT_MS,
				settleMs: SOURCE_SETTLE_MS,
				pollMs: SOURCE_POLL_MS,
			});
			const { groupFolders, resolveSettingHostUrls, toSkipped } =
				latestRef.current;
			const found = findOrphanedTagFolders({ ...input, scope: projectId });
			const skipped = toSkipped(found.unverified);
			const candidates: (FolderGroup & { urls: string[] })[] = [];
			for (const group of groupFolders(found.orphaned)) {
				const urls = resolveSettingHostUrls(group.folder.scope);
				if (urls) {
					candidates.push({ ...group, urls });
				} else {
					skipped.push({ ...group.folder, reason: "settingHostsUnknown" });
				}
			}
			if (dryRun) {
				return {
					removed: candidates.map(({ folder }) => folder),
					skipped,
					failed: [],
				};
			}
			const removed: EmptySidebarFolder[] = [];
			const failed: FailedSidebarFolder[] = [];
			for (const { folder, sectionIds, urls } of candidates) {
				try {
					await Promise.all(
						urls.map((url) =>
							deleteHostTagSetting(url, folder.scope, folder.tag),
						),
					);
				} catch (error) {
					failed.push({ ...folder, error: errorMessage(error) });
					continue;
				}
				const latest = findOrphanedTagFolders({
					...latestRef.current.findInput,
					scope: folder.scope,
				});
				const nowUnverified = latest.unverified.find(
					(current) => current.tag === folder.tag,
				);
				if (nowUnverified) {
					skipped.push({ ...folder, reason: nowUnverified.reason });
					continue;
				}
				if (!latest.orphaned.some((current) => current.tag === folder.tag)) {
					continue;
				}
				for (const sectionId of sectionIds) {
					if (collections.v2SidebarSections.get(sectionId)) {
						collections.v2SidebarSections.delete(sectionId);
					}
				}
				removed.push(folder);
			}
			return { removed, skipped, failed };
		},
		[cloudUtils, collections, queryClient],
	);

	return { emptyFolders, unverifiedFolders, removeEmptyFolders };
}
