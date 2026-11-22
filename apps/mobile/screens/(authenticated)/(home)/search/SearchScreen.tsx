import { Plural, useLingui } from "@lingui/react/macro";
import { isArchivedCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import {
	type NativeStackNavigationProp,
	useNavigation,
	useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { RowLink } from "@/components/RowLink";
import { Text } from "@/components/ui/text";
import { useArchivedCloudWorkspaces } from "@/hooks/useArchivedCloudWorkspaces";
import {
	itemFromCloudRow,
	useCloudWorkspaceItems,
} from "@/hooks/useCloudWorkspaceItems";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import { useHostsProjects } from "@/hooks/useHostProjects";
import {
	type HostWorkspaceItem,
	useHostsWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { HeaderToolbar } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { rowDetailParts } from "@/screens/(authenticated)/(home)/home/components/RowDetailLine";
import { SECTION_LABEL } from "@/screens/(authenticated)/(home)/home/components/SectionLabel";
import { WorkspaceLead } from "@/screens/(authenticated)/(home)/home/components/WorkspaceLead";
import { WorkspaceRowFrame } from "@/screens/(authenticated)/(home)/home/components/WorkspaceRowFrame";
import { useAttentionLabel } from "@/screens/(authenticated)/(home)/home/hooks/useAttentionLabel";
import { useCloudRepos } from "@/screens/(authenticated)/(home)/home/hooks/useCloudRepos";
import { useHostsTerminals } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import {
	type CloudRepo,
	repoShortName,
} from "@/screens/(authenticated)/(home)/home/utils/buildCloudSection";
import { cloudRowAttention } from "@/screens/(authenticated)/(home)/home/utils/needsMe";
import { useCloudFilters } from "@/screens/(authenticated)/(home)/hooks/useCloudFilters";
import { useScopeSelection } from "@/screens/(authenticated)/(home)/hooks/useScopeSelection";
import {
	isPlaceUnreachable,
	placeStatus,
} from "@/screens/(authenticated)/(home)/utils/placeStatus";
import { workspaceSortTime } from "@/screens/(authenticated)/(home)/utils/workspaceSortTime";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";
import { SearchBar, type SearchBarHandle } from "./components/SearchBar";
import { searchRowDetail } from "./utils/searchRowDetail";

/**
 * The native search bar lives in this sheet, not on the home screen: on a
 * root screen, activating a UISearchController on iOS 26 lays an invisible
 * view over the content that swallows every touch (#6659, unfixed through
 * react-native-screens 4.27 / iOS 26.5). On a formSheet's own header the same bar activates
 * properly — results tap, search dismisses (verified iOS 26.0). A nested
 * Stack inside the sheet never activates the controller, so no cancel ✕.
 *
 * The pool mirrors the home list's scope: every place under All hosts, the
 * selected machine's workspaces, or Cloud's sandboxes — machines outside the
 * scope aren't in memory to search. The count row says which pool answered.
 */
const repoNameOf = (repo: CloudRepo | undefined) =>
	repo ? repoShortName(repo.fullName) : null;

export function SearchScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const navigation =
		useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
	const searchBarRef = useRef<SearchBarHandle>(null);
	const [query, setQuery] = useState("");
	const clearQuery = useCallback(() => setQuery(""), []);
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const {
		scope,
		hosts: scopeHosts,
		cloud: cloudSelected,
		everything,
	} = useScopeSelection();
	const cloudScope = scope === "cloud";
	const multiScope = scope === "multi";
	const cloudInMulti = multiScope && cloudSelected;
	const { workspaces } = useHostsWorkspaces(scopeHosts);
	const { items: cloudItems } = useCloudWorkspaceItems();
	const cloudFilters = useCloudFilters();
	const searchArchived = cloudScope && cloudFilters.status === "archived";
	const { workspaces: archivedCloud } = useArchivedCloudWorkspaces({
		enabled: searchArchived,
	});
	const { byHost: projectsByHost } = useHostsProjects(scopeHosts);
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);
	const { presenceStatus } = useOrgHosts();
	const cloudRepos = useCloudRepos();
	const hostsById = useMemo(
		() => new Map(scopeHosts.map((host) => [host.machineId, host])),
		[scopeHosts],
	);
	// Rows of a machine that can't answer are listed, dimmed, as on Home.
	const isUnreachable = useCallback(
		(workspace: HostWorkspaceItem) => {
			const host = hostsById.get(workspace.hostId);
			return (
				!!host && isPlaceUnreachable(placeStatus(host.isOnline, presenceStatus))
			);
		},
		[hostsById, presenceStatus],
	);

	// Same hosts the home list polls, so the query keys are shared and the
	// sheet decorates from cache instead of paying its own fan-out.
	const terminalHosts = useMemo(
		() => scopeHosts.filter((host) => host.isOnline),
		[scopeHosts],
	);
	const { terminalsByWorkspace, attentionByWorkspace } =
		useHostsTerminals(terminalHosts);
	const attentionLabel = useAttentionLabel();
	const noProjectName = t({ message: "No project" });
	const manualUnread = useUnreadWorkspacesStore((state) => state.manualUnread);
	const cloudReadAt = useUnreadWorkspacesStore((state) => state.cloudReadAt);
	const { workspaces: activeCloud } = useCloudWorkspaces();
	const cloudRowsById = useMemo(
		() =>
			new Map([...activeCloud, ...archivedCloud].map((row) => [row.id, row])),
		[activeCloud, archivedCloud],
	);

	const projectNamesById = useMemo(
		() =>
			new Map(
				[...projectsByHost.values()]
					.flat()
					.map((project) => [project.id, project.name]),
			),
		[projectsByHost],
	);

	const matchesQuery = useCallback(
		(workspace: HostWorkspaceItem) => {
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			const sessions = terminalsByWorkspace.get(workspace.id) ?? [];
			return (
				workspace.name.toLowerCase().includes(needle) ||
				workspace.branch.toLowerCase().includes(needle) ||
				(
					(workspace.projectId
						? projectNamesById.get(workspace.projectId)
						: undefined) ?? ""
				)
					.toLowerCase()
					.includes(needle) ||
				sessions.some((row) => row.title.toLowerCase().includes(needle))
			);
		},
		[query, projectNamesById, terminalsByWorkspace],
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

	const byPinThenActivity = useCallback(
		(a: HostWorkspaceItem, b: HostWorkspaceItem) => {
			const aPin = pinnedAt[a.id];
			const bPin = pinnedAt[b.id];
			if (aPin !== undefined || bPin !== undefined) {
				if (aPin === undefined) return 1;
				if (bPin === undefined) return -1;
				return aPin - bPin;
			}
			return activityTs(b) - activityTs(a);
		},
		[pinnedAt, activityTs],
	);

	const results = useMemo(() => {
		const pool = cloudScope
			? (searchArchived
					? archivedCloud.map(itemFromCloudRow)
					: cloudItems
				).filter((workspace) =>
					cloudFilters.matchesCreator(workspace.createdByUserId),
				)
			: [
					...workspaces.filter(
						(workspace) => workspace.worktreeExists !== false,
					),
					...(cloudInMulti
						? cloudItems.filter((workspace) =>
								cloudFilters.matchesCreator(workspace.createdByUserId),
							)
						: []),
				];
		return pool.filter(matchesQuery).sort(byPinThenActivity);
	}, [
		cloudScope,
		cloudItems,
		searchArchived,
		archivedCloud,
		cloudFilters.matchesCreator,
		workspaces,
		cloudInMulti,
		matchesQuery,
		byPinThenActivity,
	]);

	const searching = query.trim().length > 0;

	// `autoFocus` is Android-only in react-native-screens. Focusing at mount
	// lands on a bar the sheet has not installed in its header yet, so wait
	// for the presentation to finish.
	useEffect(
		() =>
			navigation.addListener("transitionEnd", (event) => {
				if (!event.data.closing) searchBarRef.current?.focus();
			}),
		[navigation],
	);

	const open = useCallback(
		(workspace: HostWorkspaceItem) => {
			// A push alone would land behind this sheet — the modal sits above
			// the whole stack — so close first; the routing queue keeps order.
			router.back();
			router.push(`/(authenticated)/workspace/${workspace.id}`);
		},
		[router],
	);
	const close = useCallback(() => router.back(), [router]);
	const openFirst = useCallback(() => {
		const first = results.find((workspace) => !isUnreachable(workspace));
		if (first) open(first);
	}, [results, open, isUnreachable]);

	return (
		<>
			<HeaderToolbar placement="left">
				<HeaderToolbar.Button
					icon="close"
					accessibilityLabel={t({
						message: "Close",
					})}
					onPress={close}
				/>
			</HeaderToolbar>
			<SearchBar
				ref={searchBarRef}
				placeholder={t({
					message: "Search workspaces",
				})}
				onChangeText={setQuery}
				onCancel={clearQuery}
				onSubmit={openFirst}
				onClose={close}
			/>
			<FlatList
				className="bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="pb-8"
				data={results}
				keyExtractor={(workspace) => workspace.id}
				keyboardDismissMode="on-drag"
				keyboardShouldPersistTaps="handled"
				ListHeaderComponent={
					searching ? (
						<Text className={cn(SECTION_LABEL.label, "px-4 pb-1 pt-2")}>
							{cloudScope ? (
								<Plural
									value={results.length}
									one="# result in Cloud"
									other="# results in Cloud"
								/>
							) : multiScope && everything ? (
								<Plural
									value={results.length}
									one="# result across all hosts"
									other="# results across all hosts"
								/>
							) : multiScope ? (
								<Plural
									value={results.length}
									one="# result across the selected places"
									other="# results across the selected places"
								/>
							) : (
								<Plural
									value={results.length}
									one="# result on this host"
									other="# results on this host"
								/>
							)}
						</Text>
					) : undefined
				}
				renderItem={({ item: workspace, index }) => {
					const host = hostsById.get(workspace.hostId);
					const projectName = host
						? (workspace.projectId &&
								projectNamesById.get(workspace.projectId)) ||
							noProjectName
						: cloudRepos.status === "success"
							? repoNameOf(cloudRepos.byWorkspace.get(workspace.id))
							: null;
					const cloudRow = cloudRowsById.get(workspace.id);
					const attention = cloudRow
						? isArchivedCloudWorkspaceStatus(cloudRow.status)
							? null
							: cloudRowAttention(
									cloudRow,
									cloudReadAt[cloudRow.id],
									!!manualUnread[cloudRow.id],
								)
						: (attentionByWorkspace.get(workspace.id) ??
							(manualUnread[workspace.id] ? "review" : null));
					const detailParts = rowDetailParts({
						state: attention ? attentionLabel(attention) : null,
						pullRequest: null,
						diff: null,
						name: workspace.name,
						branch: workspace.branch,
						context: searchRowDetail({
							placeName: host?.name ?? t({ message: "Cloud" }),
							projectName,
						}),
						noChanges: t({ message: "No changes" }),
					});
					const unreachable = isUnreachable(workspace);
					return (
						<RowLink href={`/workspace/${workspace.id}`}>
							<View className={unreachable ? "opacity-50" : undefined}>
								<WorkspaceRowFrame
									lead={
										<WorkspaceLead
											attention={attention}
											creating={cloudRow?.status === "provisioning"}
											failed={false}
										/>
									}
									name={workspace.name}
									detailParts={detailParts}
									separator={index < results.length - 1}
									onPress={() => open(workspace)}
									disabled={unreachable}
									accessibilityLabel={[
										workspace.name,
										...detailParts.map((part) => part.text),
									].join(", ")}
									phLabel="search-workspace-row"
								/>
							</View>
						</RowLink>
					);
				}}
				ListEmptyComponent={
					<View className="items-center py-16">
						<Text className="text-muted-foreground text-[14px]">
							{searching
								? t({
										message: "No workspaces match your search",
									})
								: cloudScope
									? t({
											message: "No cloud workspaces yet",
										})
									: multiScope
										? t({ message: "No workspaces yet" })
										: t({
												message: "No workspaces on this host yet",
											})}
						</Text>
					</View>
				}
			/>
		</>
	);
}
