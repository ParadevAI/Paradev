import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostTagFolders } from "renderer/hooks/host-projects/useHostTagFolders";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useTagFolderContext } from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import {
	advanceStaleSectionTracker,
	findStaleSidebarSections,
	type PruneHostStatus,
	resolvePrunableScopes,
} from "./findStaleSidebarSections";

/** Re-evaluation cadence while the sidebar is mounted, so a pending
 * candidate gets its confirming pass even when no host data changes. */
const PRUNE_EVALUATION_INTERVAL_MS = 15_000;

/**
 * Garbage-collects stored sidebar section rows (`v2SidebarSections`) whose tag
 * folder no longer has any active workspace — the "empty group" left behind
 * once the last tagged workspace is deleted anywhere (app, CLI, another
 * machine). Only the local presentation row is removed; no workspace tags and
 * no host `tag_folder_settings` are touched, and folders with a settings row
 * (made on purpose via "New group", renamed or recoloured) are kept.
 *
 * Writes only under strict readiness (see resolvePrunableScopes): every
 * reachable host answered live for workspaces, folder settings and projects,
 * and every host serving the folder's project is among them. Offline or
 * failing hosts mean "do nothing", never "empty". A row is deleted only after
 * it stayed stale across two ready passes at least STALE_SECTION_CONFIRM_MS
 * apart and is older than STALE_SECTION_MIN_AGE_MS.
 */
export function usePruneStaleSidebarSections(): void {
	const collections = useCollections();
	const {
		workspaces: hostWorkspaces,
		isReady: workspacesReady,
		hostsSettled,
		hostStatuses: workspaceHostStatuses,
	} = useHostWorkspaces();
	const { hostResults: tagFolderHostResults, isReady: tagFoldersReady } =
		useHostTagFolders();
	const {
		projects: hostProjects,
		hostResults: projectHostResults,
		isReady: projectsReady,
	} = useHostProjects();
	const tagFolderContext = useTagFolderContext();
	const { data: storedSections, isReady: sectionsReady } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.select(({ sidebarSections }) => ({
					sectionId: sidebarSections.sectionId,
				})),
		[collections],
	);

	const isScopePrunable = useMemo(
		() =>
			resolvePrunableScopes({
				sectionsReady,
				workspacesReady: workspacesReady && hostsSettled,
				workspaceHostStatuses,
				tagFoldersReady,
				tagFolderHostStatuses: new Map<string, PruneHostStatus>(
					tagFolderHostResults.map((result) => [
						result.target.machineId,
						result.status === "ready" ? "live" : result.status,
					]),
				),
				projectsReady,
				projectHostStatuses: new Map<string, PruneHostStatus>(
					projectHostResults.map((result) => [
						result.target.machineId,
						result.target.hostUrl === null
							? "offline"
							: result.reachable
								? "live"
								: "pending",
					]),
				),
				projectHostIds: new Map(
					hostProjects.map((project) => [project.projectKey, project.hostIds]),
				),
			}),
		[
			sectionsReady,
			workspacesReady,
			hostsSettled,
			workspaceHostStatuses,
			tagFoldersReady,
			tagFolderHostResults,
			projectsReady,
			projectHostResults,
			hostProjects,
		],
	);

	// Latest inputs for the interval pass, which must not capture stale ones.
	const latestRef = useRef({
		isScopePrunable,
		hostWorkspaces,
		tagSettings: tagFolderContext.tagSettings,
	});
	latestRef.current = {
		isScopePrunable,
		hostWorkspaces,
		tagSettings: tagFolderContext.tagSettings,
	};
	const firstSeenStaleAtRef = useRef<Map<string, number>>(new Map());

	// biome-ignore lint/correctness/useExhaustiveDependencies: a collections swap (org switch) must restart the clock; the body only reads the ref.
	useEffect(() => {
		firstSeenStaleAtRef.current = new Map();
	}, [collections]);

	const evaluateRef = useRef<() => void>(() => {});
	evaluateRef.current = () => {
		const latest = latestRef.current;
		if (!latest.isScopePrunable) {
			// Readiness lapsed: confirmation must restart from a ready pass.
			firstSeenStaleAtRef.current = new Map();
			return;
		}
		const now = Date.now();
		const candidates = findStaleSidebarSections(
			Array.from(collections.v2SidebarSections.state.values()),
			latest.hostWorkspaces,
			latest.tagSettings,
			{ now, isScopePrunable: latest.isScopePrunable },
		);
		const { next, toDelete } = advanceStaleSectionTracker(
			firstSeenStaleAtRef.current,
			candidates.map((section) => section.sectionId),
			now,
		);
		firstSeenStaleAtRef.current = next;
		for (const sectionId of toDelete) {
			if (!collections.v2SidebarSections.get(sectionId)) continue;
			try {
				collections.v2SidebarSections.delete(sectionId);
			} catch (error) {
				console.warn("[sidebar] stale section prune failed:", error);
			}
		}
	};

	// Evaluate on every input change (a delete lands here via the host cache)…
	// biome-ignore lint/correctness/useExhaustiveDependencies: the deps are the triggers; the body reads the latest values through refs.
	useEffect(() => {
		evaluateRef.current();
	}, [isScopePrunable, hostWorkspaces, tagFolderContext, storedSections]);

	// …and on a timer, so a pending candidate gets its confirming pass.
	useEffect(() => {
		const interval = setInterval(
			() => evaluateRef.current(),
			PRUNE_EVALUATION_INTERVAL_MS,
		);
		return () => clearInterval(interval);
	}, []);
}
