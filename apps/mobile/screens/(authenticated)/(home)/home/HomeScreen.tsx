import { LegendList } from "@legendapp/list/react-native";
import { useLingui } from "@lingui/react/macro";
import { ForwardSwipe } from "@superset/forward-swipe";
import { i18n } from "@superset/i18n";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
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
import { useRowAttention } from "@/screens/(authenticated)/(home)/hooks/useRowAttention";
import { useScopeLabel } from "@/screens/(authenticated)/(home)/hooks/useScopeLabel";
import { useScopeSelection } from "@/screens/(authenticated)/(home)/hooks/useScopeSelection";
import {
	placeEmptyState,
	placeStatus,
} from "@/screens/(authenticated)/(home)/utils/placeStatus";
import { workspaceSortTime } from "@/screens/(authenticated)/(home)/utils/workspaceSortTime";
import { HeaderNotice } from "@/screens/(authenticated)/components/HeaderNotice";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useLastWorkspaceStore } from "@/screens/(authenticated)/stores/lastWorkspaceStore";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import {
	type HomeListContext,
	HomeListItemView,
} from "./components/HomeListItemView";
import { HostOfflineView } from "./components/HostOfflineView";
import { NewChatWidget } from "./components/NewChatWidget";
import { targetKeyFor } from "./components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "./components/NewChatWidget/stores/newSessionPreferencesStore";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { ScopeBar } from "./components/ScopeBar";
import { useAgentLiveActivity } from "./hooks/useAgentLiveActivity";
import { useAppReviewPrompt } from "./hooks/useAppReviewPrompt";
import { useCloudRepos } from "./hooks/useCloudRepos";
import { useFirstPaint } from "./hooks/useFirstPaint";
import { GRID_GAP, useHomeGrid } from "./hooks/useHomeGrid";
import { useHostTagFolders } from "./hooks/useHostTagFolders";
import { useHostsTerminals } from "./hooks/useHostTerminals";
import { useRefreshHostsPresence } from "./hooks/useRefreshHostsPresence";
import { useRowPullRequests } from "./hooks/useRowPullRequests";
import { useTagFolderActions } from "./hooks/useTagFolderActions";
import { useVisibleDiffStats } from "./hooks/useVisibleDiffStats";
import { useCollapsedProjectsStore } from "./stores/collapsedProjectsStore";
import { useComposerFocusStore } from "./stores/composerFocusStore";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "./stores/workspacesFilterStore";
import type { HomeListItem } from "./types";
import { buildHomeList, type HomeListLabels } from "./utils/buildHomeList";
import { CLOUD_PLACE_ID } from "./utils/buildPlacesList";
import { homeListItemKey } from "./utils/homeListItemKey";
import { PINNED_PLACE_ID } from "./utils/pinnedSection";
import { type GridRow, gridRowKey, toGridRows } from "./utils/toGridRows";

const VIEWABILITY_CONFIG = {
	itemVisiblePercentThreshold: 50,
	minimumViewTime: 250,
};

const MAX_VISIBLE_DIFF_STATS = 20;

const NAVIGATION_BAR_HEIGHT = 44;

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

	const {
		scope,
		selectedHost,
		hosts: scopeHosts,
		cloud: cloudSelected,
		orgHosts,
	} = useScopeSelection();
	const scopeLabel = useScopeLabel();
	const cloudScope = scope === "cloud";
	const multiScope = scope === "multi";
	const cloudInMulti = multiScope && cloudSelected;
	const [needsMeActive, setNeedsMeActive] = useState(false);
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
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
	const viewerId = useSession().data?.user?.id ?? null;
	// Only online machines are asked. No session marks for cloud rows: a
	// request per sandbox keeps each one awake for as long as Home is on screen.
	const onlineScopeHosts = useMemo(
		() => scopeHosts.filter((host) => host.isOnline),
		[scopeHosts],
	);
	const { terminalsByWorkspace, attentionByWorkspace } =
		useHostsTerminals(onlineScopeHosts);

	const { byHost: projectsByHost, isReady: projectsReady } =
		useHostsProjects(scopeHosts);
	const projects = useMemo(
		() => [...projectsByHost.values()].flat(),
		[projectsByHost],
	);
	const tagSettingsByHost = useHostTagFolders(scopeHosts);
	const folderActionsFor = useTagFolderActions(scopeHosts, cache);

	const liveActivityEnabled = Boolean(
		useFeatureFlag(FEATURE_FLAGS.MOBILE_LIVE_ACTIVITY),
	);
	useAgentLiveActivity({
		terminalsByWorkspace,
		workspaces,
		projects,
		enabled: liveActivityEnabled,
	});
	const { query: hostsQuery, presenceStatus } = useOrgHosts();
	const presencePending = presenceStatus === "pending";
	const statusOf = useCallback(
		(host: { isOnline: boolean }) => placeStatus(host.isOnline, presenceStatus),
		[presenceStatus],
	);
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
				(!cloudInMulti || cloudReady));

	const hasPainted = useFirstPaint(contentReady);

	const collapsed = useCollapsedProjectsStore((state) => state.collapsed);
	const collapseHydrated = useCollapsedProjectsStore(
		(state) => state.hasHydrated,
	);
	const toggleProject = useCollapsedProjectsStore(
		(state) => state.toggleProject,
	);
	const togglePlace = useCollapsedProjectsStore((state) => state.togglePlace);
	const prunePlaces = useCollapsedProjectsStore((state) => state.prunePlaces);
	// Only an answered roster says a machine is gone.
	useEffect(() => {
		if (!collapseHydrated || !hostsQuery.isSuccess) return;
		prunePlaces([
			...orgHosts.map((host) => host.machineId),
			CLOUD_PLACE_ID,
			PINNED_PLACE_ID,
		]);
	}, [collapseHydrated, hostsQuery.isSuccess, orgHosts, prunePlaces]);

	const activityTs = useCallback(
		(workspace: HostWorkspaceItem) =>
			workspaceSortTime(
				workspace,
				sort,
				(terminalsByWorkspace.get(workspace.id) ?? []).map((row) => row.ts),
			),
		[sort, terminalsByWorkspace],
	);
	const rowAttention = useRowAttention(attentionByWorkspace);

	const cloudListRows = useMemo(
		() =>
			cloudScope || cloudInMulti
				? (showArchived ? archivedCloud : activeCloud).filter((row) =>
						cloudFilters.matchesCreator(row.createdByUserId),
					)
				: [],
		[
			cloudScope,
			cloudInMulti,
			showArchived,
			archivedCloud,
			activeCloud,
			cloudFilters.matchesCreator,
		],
	);
	const cloudRepos = useCloudRepos();

	const labels = useMemo<HomeListLabels>(
		() => ({
			noProject: t({ message: "No project" }),
			cloud: t({ message: "Cloud" }),
			pinned: t({ message: "Pinned" }),
			needsInput: t({ message: "Needs input" }),
			readyForReview: t({ message: "Ready for review" }),
			working: t({ message: "Working" }),
			hostFailed: t({ message: "Could not reach the workspace host" }),
			hostEmpty: t({ message: "No workspaces on this host yet" }),
			nothingSaved: t({ message: "No saved workspaces" }),
			cloudNoMatch: t({ message: "No cloud workspaces match these filters" }),
			cloudEmpty: t({ message: "No cloud workspaces yet" }),
		}),
		[t],
	);

	const homeList = useMemo(
		() =>
			buildHomeList({
				scope,
				hosts: scopeHosts.map((host) => ({
					machineId: host.machineId,
					name: host.name,
					lastSeenAt: host.lastSeenAt,
					isOnline: host.isOnline,
					status: statusOf(host),
					state: workspacesByHost.get(host.machineId),
					projects: projectsByHost.get(host.machineId) ?? [],
					tagSettings: tagSettingsByHost.get(host.machineId) ?? [],
				})),
				cloudRows: cloudListRows,
				cloudRepos,
				cloudHasRows: activeCloud.length > 0,
				cloudInPlaces: cloudInMulti,
				archived: showArchived,
				needsMeActive,
				sort,
				pinnedAt,
				collapsed: collapseHydrated ? collapsed : null,
				activityTs,
				hostAttention: rowAttention.host,
				cloudAttention: rowAttention.cloud,
				labels,
			}),
		[
			scope,
			scopeHosts,
			statusOf,
			workspacesByHost,
			projectsByHost,
			tagSettingsByHost,
			cloudListRows,
			cloudRepos,
			activeCloud.length,
			cloudInMulti,
			showArchived,
			needsMeActive,
			sort,
			pinnedAt,
			collapseHydrated,
			collapsed,
			activityTs,
			rowAttention,
			labels,
		],
	);
	const {
		items: listItems,
		needsMeTotal,
		needsMeHidden,
		showOfflinePlaceholder,
		cloudPending,
	} = homeList;
	useEffect(() => {
		if (needsMeHidden) setNeedsMeActive(false);
	}, [needsMeHidden]);
	const needsMeOn = needsMeActive && !needsMeHidden;

	const composerWorkspaces = useMemo(
		() => [...workspaces, ...cloudItems],
		[workspaces, cloudItems],
	);
	const workspacesById = useMemo(
		() =>
			new Map(composerWorkspaces.map((workspace) => [workspace.id, workspace])),
		[composerWorkspaces],
	);

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
	const { hostPullRequest, cloudPullRequest } = useRowPullRequests({
		projects,
		items: listItems,
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
	// fetch themselves, and invalidating there fetched every one of them twice.
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

	const listContext = useMemo<HomeListContext>(
		() => ({
			cache,
			cloudCache,
			viewerId,
			diffStats,
			attentionByWorkspace,
			terminalsByWorkspace,
			hostPullRequest,
			cloudPullRequest,
			folderActionsFor,
			onCopied: handleCopied,
			onRetryPresence: refreshPresence,
			onTogglePlace: togglePlace,
			onToggleSection: toggleProject,
			onNewWorkspace: (projectId, machineId) => {
				setTargetKey(targetKeyFor(projectId, machineId));
				requestComposerFocus();
			},
		}),
		[
			cache,
			cloudCache,
			viewerId,
			diffStats,
			attentionByWorkspace,
			terminalsByWorkspace,
			hostPullRequest,
			cloudPullRequest,
			folderActionsFor,
			handleCopied,
			refreshPresence,
			togglePlace,
			toggleProject,
			setTargetKey,
			requestComposerFocus,
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
					<HomeListItemView item={item} card={false} context={listContext} />
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
								<HomeListItemView item={cell} card context={listContext} />
							</View>
						))}
					</View>
				);
			return sideInset.row ? <View style={sideInset.row}>{row}</View> : row;
		},
		[listContext, cellWidth, sideInset.row],
	);

	const selectedHostState = selectedHost
		? workspacesByHost.get(selectedHost.machineId)
		: undefined;
	const selectedHostEmptyState = selectedHost
		? placeEmptyState(statusOf(selectedHost), {
				isReady: selectedHostState?.isReady ?? false,
				failed: selectedHostState?.failed ?? false,
			})
		: null;

	// The native splash is still up until hideSplash() below; nothing to draw.
	if (!hasPainted) return null;

	const sortOption = SORT_OPTIONS.find((option) => option.value === sort);
	const sortLabel = sortOption ? i18n._(sortOption.label) : "";

	const scopeBar = (
		<ScopeBar
			scope={scope}
			label={scopeLabel}
			hostOnline={
				multiScope
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
						contentReady && !(cloudScope && cloudPending) ? (
							<View className="items-center justify-center py-20">
								<Text className="text-center text-muted-foreground text-[14px]">
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
													: selectedHostEmptyState === "failed"
														? t({
																message: "Could not reach the workspace host",
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
