import { LegendList } from "@legendapp/list/react-native";
import { useLingui } from "@lingui/react/macro";
import { ForwardSwipe } from "@superset/forward-swipe";
import { i18n } from "@superset/i18n";
import { useFormat } from "@superset/i18n/react";
import { groupCloudWorkspacesByTime } from "@superset/shared/cloud-workspace-groups";
import { isArchivedCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useQueryClient } from "@tanstack/react-query";
import { isAfter } from "date-fns";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Box } from "lucide-react-native";
import { useFeatureFlag } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useArchivedCloudWorkspaces } from "@/hooks/useArchivedCloudWorkspaces";
import { useCloudWorkspaceItems } from "@/hooks/useCloudWorkspaceItems";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import { useHostsProjects } from "@/hooks/useHostProjects";
import {
	type HostWorkspaceItem,
	useHostsWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { useReadableInset } from "@/hooks/useReadableInset";
import { useSession } from "@/lib/auth/client";
import { errorCopy } from "@/lib/errors";
import { listSideInset } from "@/lib/layout";
import { contentScrollsUnderHeader, HeaderToolbar } from "@/lib/navigation";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";
import { useVoiceActive } from "@/lib/voice/voiceStore";
import { useCloudFilters } from "@/screens/(authenticated)/(home)/hooks/useCloudFilters";
import { useScopeHosts } from "@/screens/(authenticated)/(home)/hooks/useScopeHosts";
import { useCloudScopeEnabled } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
import {
	isPlaceUnreachable,
	type PlaceEmptyState,
	placeEmptyState,
	placeStatus,
} from "@/screens/(authenticated)/(home)/utils/placeStatus";
import { workspaceSortTime } from "@/screens/(authenticated)/(home)/utils/workspaceSortTime";
import { HeaderNotice } from "@/screens/(authenticated)/components/HeaderNotice";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import {
	type OrgPullRequest,
	usePullRequests,
} from "@/screens/(authenticated)/hooks/usePullRequests";
import { useLastWorkspaceStore } from "@/screens/(authenticated)/stores/lastWorkspaceStore";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";
import { pullRequestStatus } from "@/screens/(authenticated)/workspace/[id]/utils/pullRequest";
import { CloudWorkspaceRow as CloudWorkspaceListRow } from "./components/CloudWorkspaceRow";
import { FolderSectionHeader } from "./components/FolderSectionHeader";
import { HostLabel } from "./components/HostLabel";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { targetKeyFor } from "./components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "./components/NewChatWidget/stores/newSessionPreferencesStore";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { PeriodHeader } from "./components/PeriodHeader";
import { PlaceEmptyNote } from "./components/PlaceEmptyNote";
import { ProjectSectionHeader } from "./components/ProjectSectionHeader";
import { ScopeBar } from "./components/ScopeBar";
import { WorkspaceRow } from "./components/WorkspaceRow";
import { useAgentLiveActivity } from "./hooks/useAgentLiveActivity";
import { useAppReviewPrompt } from "./hooks/useAppReviewPrompt";
import { useCloudPullRequests } from "./hooks/useCloudPullRequests";
import { useCloudRepos } from "./hooks/useCloudRepos";
import { useFirstPaint } from "./hooks/useFirstPaint";
import { GRID_GAP, useHomeGrid } from "./hooks/useHomeGrid";
import { useHostTagFolders } from "./hooks/useHostTagFolders";
import { useHostsTerminals } from "./hooks/useHostTerminals";
import { useNow } from "./hooks/useNow";
import { useRefreshHostsPresence } from "./hooks/useRefreshHostsPresence";
import { useTagFolderActions } from "./hooks/useTagFolderActions";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import {
	collapsedProjectKey,
	useCollapsedProjectsStore,
} from "./stores/collapsedProjectsStore";
import { useComposerFocusStore } from "./stores/composerFocusStore";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "./stores/workspacesFilterStore";
import { type HomeListItem, homeListItemKey } from "./types";
import { buildAllHostsList } from "./utils/buildAllHostsList";
import {
	buildHostSection,
	type HostSectionOptions,
	NO_PROJECT_SECTION_ID,
} from "./utils/buildHostSection";
import {
	buildNeedsMeList,
	cloudRowAttention,
	countAttention,
	type NeedsMeCandidate,
	needsMeCount,
} from "./utils/needsMe";
import { type GridRow, gridRowKey, toGridRows } from "./utils/toGridRows";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

const NAVIGATION_BAR_HEIGHT = 44;

/**
 * Each machine and Cloud sit under a flat label under All hosts, never a
 * collapsible level, so the list is no deeper than one machine's. Cloud rows
 * belong to no host project, so they stay grouped by time.
 */

type HomeListEntry = HomeListItem | GridRow<HomeListItem>;

const isGridCell = (item: HomeListItem) =>
	item.kind === "workspace" || item.kind === "cloudRow";

function homeListEntryKey(entry: HomeListEntry): string {
	return entry.kind === "gridRow"
		? gridRowKey(entry, homeListItemKey)
		: homeListItemKey(entry);
}

const NOTICE_MS = 1500;

export function HomeScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const voice = useVoiceSession();
	const voiceActive = useVoiceActive();
	const voiceEnabled = Boolean(useFeatureFlag(FEATURE_FLAGS.MOBILE_VOICE_MODE));
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const hasHydrated = useWorkspacesFilterStore((store) => store.hasHydrated);
	const [visibleIds, setVisibleIds] = useState<string[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	// seq gives each notice its own identity: a repeat copy while "Copied" is
	// still up remounts HeaderNotice, restarting its timer.
	const [notice, setNotice] = useState<{ text: string; seq: number } | null>(
		null,
	);
	const hideNotice = useCallback(() => setNotice(null), []);
	const handleCopied = useCallback(
		() =>
			setNotice((prev) => ({
				text: t({ message: "Copied" }),
				seq: (prev?.seq ?? 0) + 1,
			})),
		[t],
	);
	const { height: windowHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const headerHeight = useHeaderHeight();
	const readableInset = useReadableInset();
	const grid = useHomeGrid();
	const columns = grid?.columns ?? 1;
	const cellWidth = grid?.cellWidth ?? 0;
	const listInset = grid?.inset ?? readableInset;
	const sideInset = useMemo(() => listSideInset(listInset), [listInset]);
	const queryClient = useQueryClient();
	useAppReviewPrompt();
	const setTargetKey = useNewSessionPreferencesStore(
		(state) => state.setTargetKey,
	);
	const requestComposerFocus = useComposerFocusStore(
		(state) => state.requestFocus,
	);
	const { isLoadingOrganizations, activeOrganization, activeOrganizationId } =
		useOrganizations();

	const { scope, selectedHost, hosts: scopeHosts } = useScopeHosts();
	const cloudScope = scope === "cloud";
	const allScope = scope === "all";
	const cloudEnabled = useCloudScopeEnabled();
	const cloudInAll = allScope && cloudEnabled;
	const [needsMeActive, setNeedsMeActive] = useState(false);
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
	const manualUnread = useUnreadWorkspacesStore((state) => state.manualUnread);
	const cloudReadAt = useUnreadWorkspacesStore((state) => state.cloudReadAt);
	const lastWorkspaceId = useLastWorkspaceStore((state) => state.workspaceId);
	const {
		workspaces,
		byHost: workspacesByHost,
		isReady: workspacesReady,
		cache,
	} = useHostsWorkspaces(scopeHosts);
	const {
		items: cloudItems,
		cache: cloudCache,
		isReady: cloudReady,
	} = useCloudWorkspaceItems();
	const cloudFilters = useCloudFilters();
	const showArchived = cloudScope && cloudFilters.status === "archived";
	const { workspaces: archivedCloud, isReady: archivedReady } =
		useArchivedCloudWorkspaces({ enabled: showArchived });
	const { workspaces: activeCloud } = useCloudWorkspaces();
	const { formatRelativePeriod } = useFormat();
	const viewerId = useSession().data?.user?.id ?? null;
	const now = useNow(30_000);
	// Only online machines are asked. No session marks for cloud rows: a
	// request per sandbox keeps each one awake for as long as Home is on screen.
	const onlineScopeHosts = useMemo(
		() => scopeHosts.filter((host) => host.isOnline),
		[scopeHosts],
	);
	const { terminalsByWorkspace, attentionByWorkspace } =
		useHostsTerminals(onlineScopeHosts);

	// Projects are fully local — served by each host, not the cloud.
	const { byHost: projectsByHost, isReady: projectsReady } =
		useHostsProjects(scopeHosts);
	const projects = useMemo(
		() => [...projectsByHost.values()].flat(),
		[projectsByHost],
	);
	const tagSettingsByHost = useHostTagFolders(scopeHosts);
	const folderActionsFor = useTagFolderActions(scopeHosts, cache);

	// Mirrors the rows above onto the Lock Screen and Dynamic Island while the
	// app is open. Foreground-only for now: nothing server-side knows an agent
	// needs attention yet, so the card goes stale (and says so) once the app
	// closes. ActivityKit push updates are the follow-up that fixes that.
	const liveActivityEnabled = Boolean(
		useFeatureFlag(FEATURE_FLAGS.MOBILE_LIVE_ACTIVITY),
	);
	useAgentLiveActivity({
		terminalsByWorkspace,
		workspaces,
		projects,
		enabled: liveActivityEnabled,
	});
	const pullRequests = usePullRequests();
	const { query: hostsQuery, presenceStatus } = useOrgHosts();
	const presencePending = presenceStatus === "pending";
	const statusOf = useCallback(
		(host: { isOnline: boolean }) => placeStatus(host.isOnline, presenceStatus),
		[presenceStatus],
	);
	const hostOffline =
		scope === "host" &&
		!!selectedHost &&
		isPlaceUnreachable(statusOf(selectedHost));
	const refreshPresence = useRefreshHostsPresence();

	// An answer, not rows: an offline host and a host with no workspaces both
	// settle. Decoration is not waited on. With no active organization the
	// hosts query is disabled and stays pending forever, which is an answer of
	// its own — waiting on it there left the list spinning permanently.
	const contentReady =
		hasHydrated &&
		!isLoadingOrganizations &&
		(!activeOrganizationId || !hostsQuery.isPending) &&
		(cloudScope
			? showArchived
				? archivedReady
				: cloudReady
			: !presencePending &&
				workspacesReady &&
				projectsReady &&
				(!cloudInAll || cloudReady));

	const hasPainted = useFirstPaint(contentReady);

	const collapsed = useCollapsedProjectsStore((state) => state.collapsed);
	const collapseHydrated = useCollapsedProjectsStore(
		(state) => state.hasHydrated,
	);
	const toggleProject = useCollapsedProjectsStore(
		(state) => state.toggleProject,
	);

	const activityTs = useCallback(
		(workspace: HostWorkspaceItem) =>
			workspaceSortTime(
				workspace,
				sort,
				(terminalsByWorkspace.get(workspace.id) ?? []).map((row) => row.ts),
			),
		[sort, terminalsByWorkspace],
	);

	// What a row would show, for the collapsed header that hides it.
	const rowAttention = useCallback(
		(workspace: HostWorkspaceItem) =>
			attentionByWorkspace.get(workspace.id) ??
			(manualUnread[workspace.id] ? "review" : null),
		[attentionByWorkspace, manualUnread],
	);

	const noProjectName = t({ message: "No project" });
	const cloudName = t({ message: "Cloud" });

	const sectionOptions = useMemo<HostSectionOptions>(
		() => ({
			sort,
			pinnedAt,
			activityTs,
			rowAttention,
			isCollapsed: (machineId, key) =>
				collapseHydrated && !!collapsed[collapsedProjectKey(machineId, key)],
			noProjectName,
		}),
		[
			sort,
			pinnedAt,
			activityTs,
			rowAttention,
			collapsed,
			collapseHydrated,
			noProjectName,
		],
	);

	const hostSections = useMemo(
		() =>
			new Map(
				scopeHosts.map((host) => [
					host.machineId,
					buildHostSection(
						{
							machineId: host.machineId,
							workspaces:
								workspacesByHost.get(host.machineId)?.workspaces ?? [],
							projects: projectsByHost.get(host.machineId) ?? [],
							tagSettings: tagSettingsByHost.get(host.machineId) ?? [],
							offline: isPlaceUnreachable(statusOf(host)),
						},
						sectionOptions,
					),
				]),
			),
		[
			statusOf,
			scopeHosts,
			workspacesByHost,
			projectsByHost,
			tagSettingsByHost,
			sectionOptions,
		],
	);

	// An offline machine with rows from its last answer keeps them, dimmed;
	// with nothing cached the placeholder takes the screen.
	const showOfflinePlaceholder =
		hostOffline &&
		!!selectedHost &&
		(hostSections.get(selectedHost.machineId)?.length ?? 0) === 0;

	// A filter you can't see must not keep the list narrowed.
	const needsMeHidden = showArchived || showOfflinePlaceholder;
	useEffect(() => {
		if (needsMeHidden) setNeedsMeActive(false);
	}, [needsMeHidden]);
	const needsMeOn = needsMeActive && !needsMeHidden;

	// Under Cloud the list is desktop's: grouped by when each workspace last
	// heard from its agent (or was archived), newest first.
	const cloudListRows = useMemo(
		() =>
			cloudScope || cloudInAll
				? (showArchived ? archivedCloud : activeCloud).filter((row) =>
						cloudFilters.matchesCreator(row.createdByUserId),
					)
				: [],
		[
			cloudScope,
			cloudInAll,
			showArchived,
			archivedCloud,
			activeCloud,
			cloudFilters.matchesCreator,
		],
	);
	const cloudListItems = useMemo<HomeListItem[]>(() => {
		const items: HomeListItem[] = [];
		const groups = groupCloudWorkspacesByTime({
			workspaces: cloudListRows,
			now,
			sort: sort === "created" ? "created" : "activity",
			at: showArchived ? (row) => row.deletedAt ?? row.createdAt : undefined,
		});
		for (const { period, workspaces: grouped } of groups) {
			const key = `${showArchived ? "archived" : "active"}:${period.unit}:${period.count}`;
			items.push({
				kind: "periodHeader",
				key,
				label: formatRelativePeriod(period),
			});
			for (const row of grouped) items.push({ kind: "cloudRow", row });
		}
		return items;
	}, [cloudListRows, now, sort, showArchived, formatRelativePeriod]);

	const cloudRepos = useCloudRepos();

	// Rows waiting on you across the scope. An offline machine's attention is
	// not known here, so its cached rows are left out.
	const needsMeCandidates = useMemo<NeedsMeCandidate[]>(() => {
		const candidates: NeedsMeCandidate[] = [];
		for (const host of onlineScopeHosts) {
			const projectNames = new Map(
				(projectsByHost.get(host.machineId) ?? []).map((project) => [
					project.id,
					project.name,
				]),
			);
			for (const workspace of workspacesByHost.get(host.machineId)
				?.workspaces ?? []) {
				if (workspace.worktreeExists === false) continue;
				const projectName =
					(workspace.projectId && projectNames.get(workspace.projectId)) ||
					noProjectName;
				candidates.push({
					item: {
						kind: "workspace",
						workspace,
						detail: `${projectName} · ${host.name}`,
					},
					attention: rowAttention(workspace),
					ts: activityTs(workspace),
				});
			}
		}
		if (!showArchived) {
			for (const row of cloudListRows) {
				const repoName = cloudRepos.get(row.id)?.split("/")[1];
				candidates.push({
					item: {
						kind: "cloudRow",
						row,
						detail: repoName ? `${repoName} · ${cloudName}` : cloudName,
					},
					attention: cloudRowAttention(
						row,
						cloudReadAt[row.id],
						!!manualUnread[row.id],
					),
					ts: (row.agentStatusAt ?? row.createdAt).getTime(),
				});
			}
		}
		return candidates;
	}, [
		onlineScopeHosts,
		projectsByHost,
		workspacesByHost,
		noProjectName,
		rowAttention,
		activityTs,
		showArchived,
		cloudListRows,
		cloudRepos,
		cloudReadAt,
		manualUnread,
		cloudName,
	]);
	const needsMeTotal = useMemo(
		() =>
			needsMeCount(
				countAttention(
					needsMeCandidates.map((candidate) => candidate.attention),
				),
			),
		[needsMeCandidates],
	);

	const listItems = useMemo<HomeListItem[]>(() => {
		if (needsMeOn) {
			return buildNeedsMeList(needsMeCandidates, {
				input: t({ message: "Needs input" }),
				review: t({ message: "Ready for review" }),
				working: t({ message: "Working" }),
			});
		}
		if (cloudScope) return cloudListItems;
		if (allScope) {
			const emptyLabels: Record<PlaceEmptyState, string | null> = {
				loading: null,
				failed: t({ message: "Could not reach the workspace host" }),
				empty: t({ message: "No workspaces on this host yet" }),
				nothingSaved: t({ message: "No saved workspaces" }),
			};
			return buildAllHostsList({
				hosts: scopeHosts.map((host) => {
					const status = statusOf(host);
					const state = workspacesByHost.get(host.machineId);
					return {
						machineId: host.machineId,
						name: host.name,
						status,
						lastSeenAt: host.lastSeenAt,
						items: hostSections.get(host.machineId) ?? [],
						empty: {
							label:
								emptyLabels[
									placeEmptyState(status, {
										isReady: state?.isReady ?? false,
										failed: state?.failed ?? false,
									})
								],
						},
					};
				}),
				cloud: cloudInAll
					? {
							name: cloudName,
							items: cloudListItems,
							empty: {
								label:
									activeCloud.length > 0
										? t({ message: "No cloud workspaces match these filters" })
										: t({ message: "No cloud workspaces yet" }),
							},
						}
					: null,
			});
		}
		if (!selectedHost) return [];
		const section = hostSections.get(selectedHost.machineId) ?? [];
		if (showOfflinePlaceholder) {
			return [
				{
					kind: "hostOffline",
					hostName: selectedHost.name,
					lastSeenAt: selectedHost.lastSeenAt,
				},
			];
		}
		if (hostOffline) {
			return [
				{
					kind: "hostLabel",
					placeId: selectedHost.machineId,
					name: selectedHost.name,
					cloud: false,
					status: statusOf(selectedHost),
					lastSeenAt: selectedHost.lastSeenAt,
					retry: true,
				},
				...section,
			];
		}
		return section;
	}, [
		needsMeOn,
		needsMeCandidates,
		cloudScope,
		cloudListItems,
		allScope,
		scopeHosts,
		hostSections,
		workspacesByHost,
		activeCloud,
		cloudInAll,
		selectedHost,
		showOfflinePlaceholder,
		hostOffline,
		statusOf,
		cloudName,
		t,
	]);

	const composerWorkspaces = useMemo(
		() => [...workspaces, ...cloudItems],
		[workspaces, cloudItems],
	);
	const workspacesById = useMemo(
		() =>
			new Map(composerWorkspaces.map((workspace) => [workspace.id, workspace])),
		[composerWorkspaces],
	);

	const pullRequestsByRepoBranch = useMemo(() => {
		const rank = {
			closed: 3,
			draft: 1,
			merged: 2,
			open: 0,
			queued: 0,
		} as const;
		const byRepoBranch = new Map<string, OrgPullRequest>();
		for (const pullRequest of pullRequests) {
			// Key on repo coordinates from the PR URL — host projects don't
			// know cloud repo UUIDs.
			const repoPrefix = pullRequest.url
				.toLowerCase()
				.replace(/pull\/\d+.*$/, "");
			const key = `${repoPrefix}::${pullRequest.headBranch}`;
			const existing = byRepoBranch.get(key);
			if (!existing) {
				byRepoBranch.set(key, pullRequest);
				continue;
			}
			const cmp =
				rank[pullRequestStatus(pullRequest)] -
				rank[pullRequestStatus(existing)];
			if (
				cmp < 0 ||
				(cmp === 0 && isAfter(pullRequest.updatedAt, existing.updatedAt))
			) {
				byRepoBranch.set(key, pullRequest);
			}
		}
		return byRepoBranch;
	}, [pullRequests]);

	const resolveAnyHostUrl = useCallback(
		(hostId: string) =>
			cache.resolveHostUrl(hostId) ?? cloudCache.resolveHostUrl(hostId),
		[cache, cloudCache],
	);
	const diffStats = useVisibleDiffStats({
		visibleIds,
		workspacesById,
		resolveHostUrl: resolveAnyHostUrl,
	});

	const onViewableItemsChanged = useCallback(
		({
			viewableItems,
		}: {
			viewableItems: Array<{ item: HomeListEntry; isViewable: boolean }>;
		}) => {
			setVisibleIds(
				viewableItems
					.filter((viewable) => viewable.isViewable)
					.flatMap((viewable) =>
						viewable.item.kind === "gridRow"
							? viewable.item.cells
							: [viewable.item],
					)
					.filter((item) => item.kind === "workspace")
					.slice(0, MAX_VISIBLE_DIFF_STATS)
					.map((item) => item.workspace.id),
			);
		},
		[],
	);

	const refreshHostData = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["host-service", "workspaces", "list"],
		});
		void queryClient.invalidateQueries({
			queryKey: ["host-terminals", "list"],
		});
		void queryClient.invalidateQueries({ queryKey: ["diff-stats"] });
	}, [queryClient]);

	// Only on RE-focus: the first is the mount, where these queries already
	// fetch themselves, and invalidating there fetched every one of them twice
	// on a cold start.
	const hasFocused = useRef(false);
	useFocusEffect(
		useCallback(() => {
			if (!hasFocused.current) {
				hasFocused.current = true;
				return;
			}
			refreshHostData();
		}, [refreshHostData]),
	);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await queryClient
			.refetchQueries({ queryKey: ["host-service", "workspaces", "list"] })
			.catch(() => {});
		void queryClient.invalidateQueries({ queryKey: ["diff-stats"] });
		void queryClient.invalidateQueries({ queryKey: ["cloud"] });
		await refreshPresence().catch(() => {});
		setRefreshing(false);
	}, [queryClient, refreshPresence]);

	// Projects are fully local: PR rows are matched by repo coordinates
	// parsed from the PR URL (cloud repo UUIDs aren't known host-side).
	// Cloud rows' projects come from the API instead.
	const cloudPullRequests = useCloudPullRequests({
		active: listItems.some(
			(item) =>
				item.kind === "cloudRow" &&
				!isArchivedCloudWorkspaceStatus(item.row.status),
		),
		archived: listItems.some(
			(item) =>
				item.kind === "cloudRow" &&
				isArchivedCloudWorkspaceStatus(item.row.status),
		),
	});
	const repoPrefixesByProject = useMemo(
		() =>
			new Map<string, string | null>([
				...projects.map((project): [string, string | null] => [
					project.id,
					project.repoOwner && project.repoName
						? `https://github.com/${project.repoOwner}/${project.repoName}/`.toLowerCase()
						: null,
				]),
			]),
		[projects],
	);

	const renderListItem = useCallback(
		(item: HomeListItem, card: boolean) => {
			if (item.kind === "periodHeader") {
				return <PeriodHeader label={item.label} />;
			}
			if (item.kind === "placeEmpty") {
				return <PlaceEmptyNote label={item.label} />;
			}
			if (item.kind === "hostLabel") {
				return (
					<HostLabel
						name={item.name}
						cloud={item.cloud}
						status={item.status}
						lastSeenAt={item.lastSeenAt}
						onRetry={item.retry ? refreshPresence : undefined}
					/>
				);
			}
			if (item.kind === "cloudRow") {
				const repoFullName = cloudRepos.get(item.row.id);
				return (
					<CloudWorkspaceListRow
						row={item.row}
						repoFullName={repoFullName}
						pullRequest={cloudPullRequests.get(item.row.id)?.[0]}
						viewerId={viewerId}
						now={now}
						cache={cloudCache}
						onCopied={handleCopied}
						card={card}
						detail={item.detail}
					/>
				);
			}
			if (item.kind === "hostOffline") {
				return (
					<View className="py-16">
						<HostOfflineView
							hostName={item.hostName}
							lastSeenAt={item.lastSeenAt}
						/>
					</View>
				);
			}
			if (item.kind === "folderHeader") {
				const { folder, groups } = item;
				const actions = item.offline ? null : folderActionsFor(item.machineId);
				return (
					<View className={item.offline ? "opacity-50" : undefined}>
						<FolderSectionHeader
							name={folder.name}
							color={folder.color}
							count={folder.workspaces.length}
							collapsed={item.collapsed}
							attention={item.attention}
							onToggle={() => {
								void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								toggleProject(item.machineId, folder.key);
							}}
							menu={
								actions
									? {
											onRename: () =>
												void actions.renameFolder(groups.projectId, folder),
											onSetColor: (color) =>
												actions.setFolderColor(groups.projectId, folder, color),
											onDelete: () =>
												void actions.deleteFolder(
													groups.projectId,
													folder,
													groups.workspaces,
												),
										}
									: undefined
							}
						/>
					</View>
				);
			}
			if (item.kind === "projectHeader") {
				const { machineId } = item;
				const isNoProject = item.projectId === NO_PROJECT_SECTION_ID;
				return (
					<View className={item.offline ? "opacity-50" : undefined}>
						<ProjectSectionHeader
							name={item.name}
							iconUrl={item.iconUrl}
							icon={
								isNoProject ? (
									<Icon as={Box} className="text-muted-foreground size-4" />
								) : undefined
							}
							count={item.count}
							collapsed={item.collapsed}
							attention={item.attention}
							onToggle={() => {
								void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								toggleProject(machineId, item.projectId);
							}}
							onNewWorkspace={
								item.offline
									? undefined
									: () => {
											void Haptics.impactAsync(
												Haptics.ImpactFeedbackStyle.Light,
											);
											setTargetKey(
												targetKeyFor(
													isNoProject ? null : item.projectId,
													machineId,
												),
											);
											requestComposerFocus();
										}
							}
						/>
					</View>
				);
			}
			const { workspace, groups } = item;
			const folderTags = groups?.folderTags ?? [];
			const actions =
				groups && !item.offline ? folderActionsFor(groups.machineId) : null;
			const repoPrefix = workspace.projectId
				? repoPrefixesByProject.get(workspace.projectId)
				: undefined;
			const row = (
				<WorkspaceRow
					workspace={workspace}
					pullRequest={
						repoPrefix
							? pullRequestsByRepoBranch.get(
									`${repoPrefix}::${workspace.branch}`,
								)
							: undefined
					}
					diffStats={diffStats.get(workspace.id) ?? null}
					cache={cache}
					attention={attentionByWorkspace.get(workspace.id) ?? null}
					sessions={terminalsByWorkspace.get(workspace.id) ?? []}
					onCopied={handleCopied}
					card={card}
					inGroup={Boolean(item.folderTag)}
					detail={item.detail}
					disabled={item.offline}
					groups={
						groups && actions
							? {
									options: groups.folders.map((folder) => ({
										tag: folder.tag,
										name: folder.name,
									})),
									current: item.folderTag ?? null,
									onMove: (tag) =>
										actions.moveToFolder(workspace, folderTags, tag),
									onCreate: () =>
										void actions.createFolder(
											workspace,
											groups.projectId,
											folderTags,
										),
								}
							: undefined
					}
				/>
			);
			// Rows from a machine that is not answering: shown, not opened.
			return item.offline ? (
				<View pointerEvents="none" className="opacity-50">
					{row}
				</View>
			) : (
				row
			);
		},
		[
			pullRequestsByRepoBranch,
			cloudRepos,
			cloudPullRequests,
			viewerId,
			now,
			repoPrefixesByProject,
			diffStats,
			cache,
			cloudCache,
			attentionByWorkspace,
			terminalsByWorkspace,
			toggleProject,
			refreshPresence,
			setTargetKey,
			requestComposerFocus,
			handleCopied,
			folderActionsFor,
		],
	);

	const listEntries = useMemo(
		() => toGridRows(listItems, columns, isGridCell),
		[listItems, columns],
	);

	const renderItem = useCallback(
		({ item }: { item: HomeListEntry }) => {
			const row =
				item.kind !== "gridRow" ? (
					renderListItem(item, false)
				) : (
					<View
						className="flex-row"
						style={{ gap: GRID_GAP, paddingBottom: GRID_GAP }}
					>
						{item.cells.map((cell) => (
							<View
								key={homeListItemKey(cell)}
								className="border-border rounded-xl border"
								style={{ width: cellWidth }}
							>
								{renderListItem(cell, true)}
							</View>
						))}
					</View>
				);
			return sideInset.row ? <View style={sideInset.row}>{row}</View> : row;
		},
		[renderListItem, cellWidth, sideInset.row],
	);

	// The native splash is still up until hideSplash() below; nothing to draw.
	if (!hasPainted) return null;

	const sortOption = SORT_OPTIONS.find((option) => option.value === sort);
	const sortLabel = sortOption ? i18n._(sortOption.label) : "";

	const scopeBar = (
		<ScopeBar
			scope={scope}
			hostName={selectedHost?.name ?? null}
			hostOnline={
				allScope
					? scopeHosts.some((host) => host.isOnline)
					: (selectedHost?.isOnline ?? false)
			}
			sortLabel={showArchived ? null : sortLabel}
			needsMe={
				needsMeHidden
					? null
					: {
							count: needsMeTotal,
							active: needsMeOn,
							onPress: () => {
								void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								setNeedsMeActive((active) => !active);
							},
						}
			}
			onPressScope={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push("/(authenticated)/(home)/filter/scope");
			}}
			onPressSort={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push("/(authenticated)/(home)/filter/sort");
			}}
		/>
	);

	return (
		<>
			<ForwardSwipe
				enabled={lastWorkspaceId !== null}
				onSwipeBegin={() => {
					if (lastWorkspaceId) {
						router.push(`/(authenticated)/workspace/${lastWorkspaceId}`);
					}
				}}
			/>
			<OrganizationHeaderButton
				isLoading={isLoadingOrganizations}
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					router.push("/(authenticated)/settings");
				}}
			/>
			{/* Search opens as a sheet rather than a search bar in this header: on
			    a root screen a UISearchController on iOS 26 lays an invisible view
			    over the content that swallows every touch (#6659); on the sheet's
			    own header the same bar works. Hidden while the host is
			    offline — its list isn't shown, so there is nothing to search. */}
			<Stack.Screen
				options={{
					headerTransparent: contentScrollsUnderHeader,
					headerTitle: notice
						? () => (
								<HeaderNotice
									key={notice.seq}
									onHidden={hideNotice}
									text={notice.text}
									visibleFor={NOTICE_MS}
								/>
							)
						: undefined,
				}}
			/>
			{showOfflinePlaceholder && !voiceEnabled ? null : (
				<HeaderToolbar placement="right">
					{voiceEnabled ? (
						<HeaderToolbar.Button
							icon="voice"
							accessibilityLabel={t({ message: "Start voice mode" })}
							onPress={() => {
								void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
								void voice
									.start()
									.catch((error: unknown) =>
										Alert.alert(
											t({ message: "Couldn't start voice mode" }),
											errorCopy(error),
										),
									);
							}}
						/>
					) : null}
					<HeaderToolbar.Button
						hidden={showOfflinePlaceholder}
						icon="search"
						accessibilityLabel={t({
							message: "Search workspaces",
						})}
						onPress={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.push("/(authenticated)/(home)/search");
						}}
					/>
				</HeaderToolbar>
			)}
			{showOfflinePlaceholder && selectedHost ? (
				<View
					className="bg-background flex-1"
					style={{
						minHeight:
							windowHeight - insets.top - NAVIGATION_BAR_HEIGHT - insets.bottom,
						paddingTop: headerHeight,
						// On the outer view, not the ScrollView: the scope bar sits
						// outside it here, and both belong in the list's column.
						paddingHorizontal: readableInset,
					}}
				>
					{scopeBar}
					<ScrollView
						className="flex-1"
						contentContainerStyle={{
							flexGrow: 1,
							paddingTop: 24,
							paddingBottom: 112,
						}}
					>
						<HostOfflineView
							hostName={selectedHost.name}
							lastSeenAt={selectedHost.lastSeenAt}
						/>
					</ScrollView>
				</View>
			) : (
				<LegendList
					className="flex-1 bg-background"
					contentInsetAdjustmentBehavior="automatic"
					keyboardDismissMode="on-drag"
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{
						// Fills the screen under a transparent header; an opaque header
						// already takes its height, so the list would scroll empty.
						minHeight: contentScrollsUnderHeader
							? windowHeight -
								insets.top -
								NAVIGATION_BAR_HEIGHT -
								insets.bottom
							: undefined,
						paddingBottom: 112,
						paddingTop: 8,
						...sideInset.content,
					}}
					data={listEntries}
					extraData={renderItem}
					keyExtractor={homeListEntryKey}
					renderItem={renderItem}
					ListHeaderComponent={
						sideInset.row ? (
							<View style={sideInset.row}>{scopeBar}</View>
						) : (
							scopeBar
						)
					}
					viewabilityConfig={VIEWABILITY_CONFIG}
					onViewableItemsChanged={onViewableItemsChanged}
					refreshControl={
						<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
					}
					ListEmptyComponent={
						contentReady ? (
							<View className="items-center justify-center py-20">
								<Text className="text-center text-muted-foreground">
									{showArchived
										? t({ message: "No archived workspaces" })
										: !needsMeOn && cloudScope && activeCloud.length > 0
											? t({
													message: "No cloud workspaces match these filters",
												})
											: needsMeOn
												? t({ message: "Nothing needs you right now" })
												: cloudScope
													? t({
															message: "No cloud workspaces yet",
														})
													: t({
															message: "No projects on this host yet",
														})}
								</Text>
							</View>
						) : (
							// Timed out with answers outstanding: the list is unknown,
							// not empty, so neither nothing nor "No projects".
							<View className="items-center justify-center py-20">
								<ActivityIndicator />
							</View>
						)
					}
				/>
			)}
			{/* Cloud rows included: the row's "+" targets a workspace by id, and
			    the composer has to find a sandbox workspace as readily as a
			    machine's to start an agent in it. */}
			{voiceActive ? null : <NewChatWidget workspaces={composerWorkspaces} />}
		</>
	);
}
