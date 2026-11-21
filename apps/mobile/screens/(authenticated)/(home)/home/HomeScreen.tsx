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
import { useCallback, useMemo, useRef, useState } from "react";
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
import {
	type CloudWorkspaceRow,
	useCloudWorkspaces,
} from "@/hooks/useCloudWorkspaces";
import { useHostProjects } from "@/hooks/useHostProjects";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
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
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { useWorkspaceScope } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
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
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { targetKeyFor } from "./components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "./components/NewChatWidget/stores/newSessionPreferencesStore";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { PeriodHeader } from "./components/PeriodHeader";
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
import {
	type TerminalAttention,
	type TerminalsHost,
	useHostsTerminals,
} from "./hooks/useHostTerminals";
import { useNow } from "./hooks/useNow";
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
import {
	groupByTagFolder,
	type TagFolderGroup,
} from "./utils/groupByTagFolder";
import { orderProjectChildren } from "./utils/orderProjectChildren";
import { strongestAttention } from "./utils/strongestAttention";
import { type GridRow, gridRowKey, toGridRows } from "./utils/toGridRows";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

const NAVIGATION_BAR_HEIGHT = 44;

const NO_PROJECT_SECTION_ID = "__none";

/**
 * Cloud is a scope of its own, picked from the same chip as your machines,
 * rather than a section pinned above whichever machine is selected. It belongs
 * to no host and, since a sandbox's project row is fabricated, to no project a
 * host knows — so under Cloud the rows are a flat list and the chip, not a
 * header, says where you are. Desktop pins it above the projects instead: a
 * sidebar can afford a permanent section, a phone list is the whole screen.
 */

/** A project's groups, for the group menus of its rows and headers. */
interface ProjectGroups {
	projectId: string | null;
	folders: TagFolderGroup<HostWorkspaceItem>[];
	folderTags: string[];
	/** Every workspace in the scope, hidden ones included, for Delete group. */
	workspaces: HostWorkspaceItem[];
}

type HomeListItem =
	| {
			kind: "projectHeader";
			projectId: string;
			name: string;
			iconUrl?: string | null;
			count: number;
			collapsed: boolean;
			attention: TerminalAttention | null;
	  }
	| {
			kind: "folderHeader";
			folder: TagFolderGroup<HostWorkspaceItem>;
			collapsed: boolean;
			attention: TerminalAttention | null;
			groups: ProjectGroups;
	  }
	| {
			kind: "workspace";
			workspace: HostWorkspaceItem;
			groups?: ProjectGroups;
			folderTag?: string | null;
	  }
	| {
			kind: "hostOffline";
			hostName: string;
			lastSeenAt: number | null | undefined;
	  }
	| {
			kind: "periodHeader";
			key: string;
			label: string;
	  }
	| { kind: "cloudRow"; row: CloudWorkspaceRow };

function homeListItemKey(item: HomeListItem): string {
	switch (item.kind) {
		case "projectHeader":
			return `project:${item.projectId}`;
		case "folderHeader":
			return `folder:${item.folder.key}`;
		case "workspace":
			return `ws:${item.workspace.id}`;
		case "periodHeader":
			return `period:${item.key}`;
		case "cloudRow":
			return `cloud:${item.row.id}`;
		default:
			return "host-offline";
	}
}

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

	const selectedHost = useSelectedHost();
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
	const manualUnread = useUnreadWorkspacesStore((state) => state.manualUnread);
	const lastWorkspaceId = useLastWorkspaceStore((state) => state.workspaceId);
	const {
		workspaces,
		isReady: workspacesReady,
		cache,
	} = useHostWorkspaces(selectedHost);
	const {
		items: cloudItems,
		cache: cloudCache,
		isReady: cloudReady,
	} = useCloudWorkspaceItems();
	const cloudScope = useWorkspaceScope() === "cloud";
	const cloudFilters = useCloudFilters();
	const showArchived = cloudScope && cloudFilters.status === "archived";
	const { workspaces: archivedCloud, isReady: archivedReady } =
		useArchivedCloudWorkspaces({ enabled: showArchived });
	const { workspaces: activeCloud } = useCloudWorkspaces();
	const { formatRelativePeriod } = useFormat();
	const viewerId = useSession().data?.user?.id ?? null;
	const now = useNow(30_000);
	// No session marks for cloud rows: a request per sandbox keeps each one
	// awake for as long as Home is on screen.
	const terminalHosts = useMemo<TerminalsHost[]>(
		() => (cloudScope || !selectedHost ? [] : [selectedHost]),
		[selectedHost, cloudScope],
	);
	const { terminalsByWorkspace, attentionByWorkspace } =
		useHostsTerminals(terminalHosts);

	// Projects are fully local — served by the selected host, not the cloud.
	const { projects, isReady: projectsReady } = useHostProjects(selectedHost);
	const tagSettings = useHostTagFolders(cloudScope ? null : selectedHost);
	const folderActions = useTagFolderActions(
		cloudScope ? null : selectedHost,
		cache,
	);

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
	const hostOffline =
		!cloudScope && !!selectedHost && !selectedHost.isOnline && !presencePending;

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
			: !presencePending && workspacesReady && projectsReady);

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

	// Pinned first (oldest pin leads, desktop's ordering), then newest.
	const byPinThenActivity = useCallback(
		(a: HostWorkspaceItem, b: HostWorkspaceItem) => {
			const aPin = pinnedAt[a.id];
			const bPin = pinnedAt[b.id];
			if (aPin !== undefined || bPin !== undefined) {
				if (aPin === undefined) return 1;
				if (bPin === undefined) return -1;
				return aPin - bPin;
			}
			const diff = activityTs(b) - activityTs(a);
			return Number.isNaN(diff) ? a.name.localeCompare(b.name) : diff;
		},
		[pinnedAt, activityTs],
	);

	// A record whose worktree folder is gone from the host's disk is a stale
	// shell nothing can run in — not worth a list slot.
	const liveWorkspaces = useMemo(
		() => workspaces.filter((workspace) => workspace.worktreeExists !== false),
		[workspaces],
	);

	const listItems = useMemo<HomeListItem[]>(() => {
		const items: HomeListItem[] = [];

		// Under Cloud the list is desktop's: grouped by when each workspace last
		// heard from its agent (or was archived), newest first.
		if (cloudScope) {
			const rows = (showArchived ? archivedCloud : activeCloud).filter((row) =>
				cloudFilters.matchesCreator(row.createdByUserId),
			);
			const groups = groupCloudWorkspacesByTime({
				workspaces: rows,
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
		}

		// A machine's rows. When it is offline the whole scope gives way to the
		// placeholder — Cloud is a chip away rather than stranded above it.
		if (selectedHost && hostOffline) {
			items.push({
				kind: "hostOffline",
				hostName: selectedHost.name,
				lastSeenAt: selectedHost.lastSeenAt,
			});
			return items;
		}

		// What a row would show, for the collapsed header that hides it.
		const rowAttention = (workspace: HostWorkspaceItem) =>
			attentionByWorkspace.get(workspace.id) ??
			(manualUnread[workspace.id] ? "review" : null);

		const pool = liveWorkspaces.filter(
			(workspace) => workspace.hostId === selectedHost?.machineId,
		);

		// A project id the host no longer reports is as good as none: grouping
		// under it would render the workspace nowhere, since sections come from
		// the reported list. Also covers the beat where workspaces have loaded
		// and projects haven't.
		const knownProjectIds = new Set(projects.map((project) => project.id));
		const byProject = new Map<string, HostWorkspaceItem[]>();
		for (const workspace of pool) {
			const projectId =
				workspace.projectId && knownProjectIds.has(workspace.projectId)
					? workspace.projectId
					: NO_PROJECT_SECTION_ID;
			const group = byProject.get(projectId);
			if (group) group.push(workspace);
			else byProject.set(projectId, [workspace]);
		}

		const sections = [
			...projects.map((project) => ({
				projectId: project.id,
				name: project.name,
				iconUrl: project.iconUrl,
				createdAt: project.createdAt,
			})),
			{
				projectId: NO_PROJECT_SECTION_ID,
				name: t({ message: "No project" }),
				iconUrl: null,
				createdAt: Number.NEGATIVE_INFINITY,
			},
		]
			.map((section) => ({
				...section,
				workspaces: (byProject.get(section.projectId) ?? []).sort(
					byPinThenActivity,
				),
			}))
			// An empty section is a row that says nothing and does nothing — the
			// composer's project picker is where you start work in a project that
			// has none yet.
			.filter((section) => section.workspaces.length > 0)
			// Projects keep one order in every mode, as on desktop: newest
			// first, where desktop puts each new project before any drag.
			.sort(
				(a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name),
			);

		for (const section of sections) {
			const isCollapsed =
				collapseHydrated &&
				!!collapsed[
					collapsedProjectKey(selectedHost?.machineId ?? "", section.projectId)
				];
			items.push({
				kind: "projectHeader",
				projectId: section.projectId,
				name: section.name,
				iconUrl: section.iconUrl,
				count: section.workspaces.length,
				collapsed: isCollapsed,
				attention: isCollapsed
					? strongestAttention(section.workspaces.map(rowAttention))
					: null,
			});
			if (isCollapsed) continue;
			const projectId =
				section.projectId === NO_PROJECT_SECTION_ID ? null : section.projectId;
			// "No project" also holds rows of projects the host stopped
			// reporting; only true sessions can be grouped there.
			const canGroup = (workspace: HostWorkspaceItem) =>
				projectId !== null || workspace.projectId === null;
			const groupable = section.workspaces.filter(canGroup);
			const grouped = groupByTagFolder(projectId, groupable, tagSettings);
			const loose = new Set(grouped.ungrouped);
			grouped.ungrouped = section.workspaces.filter(
				(workspace) => loose.has(workspace) || !canGroup(workspace),
			);
			const groups: ProjectGroups = {
				projectId,
				folders: grouped.folders,
				folderTags: grouped.folderTags,
				workspaces: workspaces.filter(
					(workspace) =>
						workspace.hostId === selectedHost?.machineId &&
						workspace.projectId === projectId,
				),
			};
			const children = orderProjectChildren(
				grouped,
				sort,
				activityTs,
				(workspace) => pinnedAt[workspace.id] !== undefined,
			);
			for (const child of children) {
				if (child.type === "workspace") {
					items.push({
						kind: "workspace",
						workspace: child.workspace,
						groups: canGroup(child.workspace) ? groups : undefined,
						folderTag: null,
					});
					continue;
				}
				const { folder } = child;
				const folderCollapsed =
					collapseHydrated &&
					!!collapsed[
						collapsedProjectKey(selectedHost?.machineId ?? "", folder.key)
					];
				items.push({
					kind: "folderHeader",
					folder,
					collapsed: folderCollapsed,
					attention: folderCollapsed
						? strongestAttention(folder.workspaces.map(rowAttention))
						: null,
					groups,
				});
				if (folderCollapsed) continue;
				for (const workspace of folder.workspaces) {
					items.push({
						kind: "workspace",
						workspace,
						groups: canGroup(workspace) ? groups : undefined,
						folderTag: folder.tag,
					});
				}
			}
		}

		return items;
	}, [
		workspaces,
		liveWorkspaces,
		cloudScope,
		showArchived,
		archivedCloud,
		activeCloud,
		cloudFilters.matchesCreator,
		sort,
		formatRelativePeriod,
		now,
		selectedHost,
		projects,
		tagSettings,
		byPinThenActivity,
		activityTs,
		pinnedAt,
		attentionByWorkspace,
		manualUnread,
		collapsed,
		collapseHydrated,
		t,
		hostOffline,
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
		setRefreshing(false);
	}, [queryClient]);

	// Projects are fully local: PR rows are matched by repo coordinates
	// parsed from the PR URL (cloud repo UUIDs aren't known host-side).
	// Cloud rows' projects come from the API instead.
	const cloudRepos = useCloudRepos();
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
				return (
					<FolderSectionHeader
						name={folder.name}
						color={folder.color}
						count={folder.workspaces.length}
						collapsed={item.collapsed}
						attention={item.attention}
						onToggle={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							toggleProject(selectedHost?.machineId ?? "", folder.key);
						}}
						menu={{
							onRename: () =>
								void folderActions.renameFolder(groups.projectId, folder),
							onSetColor: (color) =>
								folderActions.setFolderColor(groups.projectId, folder, color),
							onDelete: () =>
								void folderActions.deleteFolder(
									groups.projectId,
									folder,
									groups.workspaces,
								),
						}}
					/>
				);
			}
			if (item.kind === "projectHeader") {
				// Only a machine's projects get headers — Cloud is a flat scope.
				const machineId = selectedHost?.machineId;
				const isNoProject = item.projectId === NO_PROJECT_SECTION_ID;
				return (
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
							toggleProject(machineId ?? "", item.projectId);
						}}
						onNewWorkspace={
							machineId
								? () => {
										void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										setTargetKey(
											targetKeyFor(
												isNoProject ? null : item.projectId,
												machineId,
											),
										);
										requestComposerFocus();
									}
								: undefined
						}
					/>
				);
			}
			const { workspace, groups } = item;
			const folderTags = groups?.folderTags ?? [];
			const repoPrefix = workspace.projectId
				? repoPrefixesByProject.get(workspace.projectId)
				: undefined;
			return (
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
					groups={
						groups
							? {
									options: groups.folders.map((folder) => ({
										tag: folder.tag,
										name: folder.name,
									})),
									current: item.folderTag ?? null,
									onMove: (tag) =>
										folderActions.moveToFolder(workspace, folderTags, tag),
									onCreate: () =>
										void folderActions.createFolder(
											workspace,
											groups.projectId,
											folderTags,
										),
								}
							: undefined
					}
				/>
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
			selectedHost,
			setTargetKey,
			requestComposerFocus,
			handleCopied,
			folderActions,
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
			scope={cloudScope ? "cloud" : "host"}
			hostName={selectedHost?.name ?? null}
			hostOnline={selectedHost?.isOnline ?? false}
			sortLabel={showArchived ? null : sortLabel}
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
			{selectedHost && hostOffline && !voiceEnabled ? null : (
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
						hidden={Boolean(selectedHost && hostOffline)}
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
			{selectedHost && hostOffline ? (
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
										: cloudScope && activeCloud.length > 0
											? t({
													message: "No cloud workspaces match these filters",
												})
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
