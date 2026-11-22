import type { TagFolderSettingInput } from "@superset/shared/workspace-tag-folders";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { HostProjectItem } from "@/hooks/useHostProjects";
import type {
	HostWorkspaceItem,
	HostWorkspacesState,
} from "@/hooks/useHostWorkspaces";
import { placeDetail } from "@/screens/(authenticated)/(home)/utils/placeDetail";
import {
	isPlaceUnreachable,
	type PlaceEmptyState,
	type PlaceStatus,
	placeEmptyState,
} from "@/screens/(authenticated)/(home)/utils/placeStatus";
import type { WorkspaceScope } from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import {
	collapsedProjectKey,
	isPlaceCollapsed,
} from "../../stores/collapsedProjectsStore/collapseKeys";
import type { WorkspaceSort } from "../../stores/workspacesFilterStore/workspacesFilterStore";
import type { HomeListItem } from "../../types";
import {
	buildCloudSection,
	type CloudRepos,
	cloudRepoName,
} from "../buildCloudSection";
import { buildHostSection } from "../buildHostSection";
import { buildPlacesList, CLOUD_PLACE_ID } from "../buildPlacesList";
import {
	buildNeedsMeList,
	countAttention,
	type NeedsMeCandidate,
	needsMeCount,
} from "../needsMe";
import {
	PINNED_PLACE_ID,
	type PinnedEntry,
	pickPinned,
	pinnedRows,
	withPinnedSection,
} from "../pinnedSection";
import { withNeighbourFlags } from "../withNeighbourFlags";

export interface HomeListHost {
	machineId: string;
	name: string;
	lastSeenAt?: number | null;
	isOnline: boolean;
	status: PlaceStatus;
	/** Undefined until the host's list query exists. */
	state: HostWorkspacesState | undefined;
	projects: readonly HostProjectItem[];
	tagSettings: readonly TagFolderSettingInput[];
}

export interface HomeListLabels {
	noProject: string;
	cloud: string;
	pinned: string;
	needsInput: string;
	readyForReview: string;
	working: string;
	hostFailed: string;
	hostEmpty: string;
	nothingSaved: string;
	cloudNoMatch: string;
	cloudEmpty: string;
}

export interface HomeListInput {
	scope: WorkspaceScope;
	/** The places in scope; the selected one alone under one host. */
	hosts: readonly HomeListHost[];
	/** Cloud's rows after the creator filter; empty where Cloud is not shown. */
	cloudRows: readonly CloudWorkspaceRow[];
	cloudRepos: CloudRepos;
	/** Cloud holds active rows the filters hide. */
	cloudHasRows: boolean;
	/** Cloud is one of several places. */
	cloudInPlaces: boolean;
	archived: boolean;
	needsMeActive: boolean;
	sort: WorkspaceSort;
	pinnedAt: Readonly<Record<string, number>>;
	/** Null until the collapse store has loaded: everything reads expanded. */
	collapsed: Readonly<Record<string, true>> | null;
	activityTs: (workspace: HostWorkspaceItem) => number;
	hostAttention: (workspace: HostWorkspaceItem) => TerminalAttention | null;
	cloudAttention: (row: CloudWorkspaceRow) => TerminalAttention | null;
	labels: HomeListLabels;
}

export interface HomeList {
	items: HomeListItem[];
	needsMeTotal: number;
	/** Needs me cannot apply to what is shown, so its chip hides. */
	needsMeHidden: boolean;
	/** One offline host with nothing cached: the placeholder takes the screen. */
	showOfflinePlaceholder: boolean;
	/** Cloud's rows wait on the repositories before they can be grouped. */
	cloudPending: boolean;
}

const isListedOn = (host: HomeListHost) => (workspace: HostWorkspaceItem) =>
	workspace.hostId === host.machineId && workspace.worktreeExists !== false;

const rowsOf = (host: HomeListHost) =>
	(host.state?.workspaces ?? []).filter(isListedOn(host));

function projectNameOf(
	host: HomeListHost,
	workspace: HostWorkspaceItem,
	noProject: string,
): string {
	return (
		(workspace.projectId &&
			host.projects.find((project) => project.id === workspace.projectId)
				?.name) ||
		noProject
	);
}

/** Home's whole list: Pinned, then the places with their sections, or Needs me. */
export function buildHomeList(input: HomeListInput): HomeList {
	const {
		scope,
		hosts,
		cloudRows,
		cloudRepos,
		archived,
		sort,
		collapsed,
		activityTs,
		hostAttention,
		cloudAttention,
		labels,
	} = input;
	const isCollapsed = (placeId: string, key: string) =>
		!!collapsed?.[collapsedProjectKey(placeId, key)];
	const placeCollapsed = (placeId: string) =>
		collapsed !== null && isPlaceCollapsed(collapsed, placeId);

	const pinned = pickPinned(
		[
			...hosts.flatMap((host) =>
				rowsOf(host).map(
					(workspace): PinnedEntry => ({
						id: workspace.id,
						kind: "host",
						workspace,
						projectName: projectNameOf(host, workspace, labels.noProject),
						hostName: host.name,
						offline: isPlaceUnreachable(host.status),
					}),
				),
			),
			...(archived
				? []
				: cloudRows.map(
						(row): PinnedEntry => ({
							id: row.id,
							kind: "cloud",
							row,
							repoName: cloudRepoName(cloudRepos, row.id),
						}),
					)),
		],
		input.pinnedAt,
	);
	const lifted = new Set(pinned.map((entry) => entry.id));

	const hostSections = new Map(
		hosts.map((host) => [
			host.machineId,
			buildHostSection(
				{
					machineId: host.machineId,
					workspaces: host.state?.workspaces ?? [],
					projects: host.projects,
					tagSettings: host.tagSettings,
					offline: isPlaceUnreachable(host.status),
				},
				{
					sort,
					activityTs,
					rowAttention: hostAttention,
					isCollapsed,
					noProjectName: labels.noProject,
					lifted,
				},
			),
		]),
	);

	const selectedHost = scope === "host" ? (hosts[0] ?? null) : null;
	const selectedOffline =
		!!selectedHost && isPlaceUnreachable(selectedHost.status);
	const showOfflinePlaceholder =
		selectedOffline &&
		(hostSections.get(selectedHost.machineId)?.length ?? 0) === 0 &&
		pinned.length === 0;
	const needsMeHidden = archived || showOfflinePlaceholder;
	const needsMeOn = input.needsMeActive && !needsMeHidden;

	const cloudItems = buildCloudSection(cloudRows, cloudRepos, {
		sort,
		archived,
		lifted,
		rowAttention: cloudAttention,
		isCollapsed,
		noProjectName: labels.noProject,
	});

	// An offline machine's attention is not known here, so its rows stay out.
	const needsMeCandidates: NeedsMeCandidate[] = [
		...hosts
			.filter((host) => host.isOnline)
			.flatMap((host) =>
				rowsOf(host).map(
					(workspace): NeedsMeCandidate => ({
						item: {
							kind: "workspace",
							workspace,
							detail: placeDetail({
								projectName: projectNameOf(host, workspace, labels.noProject),
								placeName: host.name,
							}),
						},
						attention: hostAttention(workspace),
						ts: activityTs(workspace),
					}),
				),
			),
		...(archived
			? []
			: cloudRows.map(
					(row): NeedsMeCandidate => ({
						item: {
							kind: "cloudRow",
							row,
							detail: placeDetail({
								projectName: cloudRepoName(cloudRepos, row.id),
								placeName: labels.cloud,
							}),
						},
						attention: cloudAttention(row),
						ts: (row.agentStatusAt ?? row.createdAt).getTime(),
					}),
				)),
	];
	const needsMeTotal = needsMeCount(
		countAttention(needsMeCandidates.map((candidate) => candidate.attention)),
	);

	const placeItems = (): HomeListItem[] => {
		if (needsMeOn) {
			return buildNeedsMeList(needsMeCandidates, {
				input: labels.needsInput,
				review: labels.readyForReview,
				working: labels.working,
			});
		}
		if (scope === "cloud") return cloudItems ?? [];
		if (scope === "multi") {
			const emptyLabels: Record<PlaceEmptyState, string | null> = {
				loading: null,
				failed: labels.hostFailed,
				empty: labels.hostEmpty,
				nothingSaved: labels.nothingSaved,
			};
			return buildPlacesList({
				hosts: hosts.map((host) => ({
					machineId: host.machineId,
					name: host.name,
					status: host.status,
					lastSeenAt: host.lastSeenAt,
					collapsed: placeCollapsed(host.machineId),
					attentions: rowsOf(host)
						.filter((workspace) => !lifted.has(workspace.id))
						.map(hostAttention),
					items: hostSections.get(host.machineId) ?? [],
					// Every row pinned is not an empty place.
					empty: pinned.some(
						(entry) =>
							entry.kind === "host" &&
							entry.workspace.hostId === host.machineId,
					)
						? undefined
						: {
								label:
									emptyLabels[
										placeEmptyState(host.status, {
											isReady: host.state?.isReady ?? false,
											failed: host.state?.failed ?? false,
										})
									],
							},
				})),
				cloud: input.cloudInPlaces
					? {
							name: labels.cloud,
							collapsed: placeCollapsed(CLOUD_PLACE_ID),
							attentions: cloudRows
								.filter((row) => !lifted.has(row.id))
								.map(cloudAttention),
							items: cloudItems ?? [],
							empty: pinned.some((entry) => entry.kind === "cloud")
								? undefined
								: {
										label:
											cloudItems === null
												? null
												: input.cloudHasRows
													? labels.cloudNoMatch
													: labels.cloudEmpty,
									},
						}
					: null,
			});
		}
		if (!selectedHost) return [];
		if (showOfflinePlaceholder) {
			return [
				{
					kind: "hostOffline",
					hostName: selectedHost.name,
					lastSeenAt: selectedHost.lastSeenAt,
				},
			];
		}
		const section = hostSections.get(selectedHost.machineId) ?? [];
		if (!selectedOffline) return section;
		return [
			{
				kind: "placeLabel",
				placeId: selectedHost.machineId,
				name: selectedHost.name,
				status: selectedHost.status,
				lastSeenAt: selectedHost.lastSeenAt,
				retry: true,
				first: true,
			},
			...section,
		];
	};

	const built = placeItems();
	const [head, ...rest] = built;
	// A section label at the top sits close to the chips, as a first host header does.
	const headed =
		head?.kind === "sectionLabel" ? [{ ...head, first: true }, ...rest] : built;
	const items = withNeighbourFlags(
		withPinnedSection(headed, {
			label: labels.pinned,
			rows:
				needsMeOn || archived || showOfflinePlaceholder
					? []
					: pinnedRows(pinned, labels.cloud),
			attentions: pinned.map((entry) =>
				entry.kind === "host"
					? hostAttention(entry.workspace)
					: cloudAttention(entry.row),
			),
			collapsed: placeCollapsed(PINNED_PLACE_ID),
		}),
	);

	return {
		items,
		needsMeTotal,
		needsMeHidden,
		showOfflinePlaceholder,
		cloudPending: cloudItems === null,
	};
}
