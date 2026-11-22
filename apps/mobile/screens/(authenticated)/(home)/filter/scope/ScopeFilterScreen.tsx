import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useHostsWorkspaces } from "@/hooks/useHostWorkspaces";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { posthog } from "@/lib/posthog";
import { useHostsTerminals } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import {
	type AttentionCounts,
	cloudRowAttention,
	countAttention,
} from "@/screens/(authenticated)/(home)/home/utils/needsMe";
import { useCloudFilters } from "@/screens/(authenticated)/(home)/hooks/useCloudFilters";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import {
	useAllHostsOffered,
	useCloudScopeEnabled,
	useWorkspaceScope,
} from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
import { getLastSeenTime } from "@/screens/(authenticated)/(home)/utils/getLastSeenTime";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";

const NO_HOSTS: never[] = [];

/**
 * Where the list looks: every place at once where there are few enough to
 * ask, Cloud where it is enabled, or one of your machines. Counts show only
 * while All hosts is offered: past that, Home never asks every machine.
 */
export function ScopeFilterScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const { hosts } = useOrgHosts();
	const selectedHost = useSelectedHost();
	const scope = useWorkspaceScope();
	const cloudEnabled = useCloudScopeEnabled();
	const allOffered = useAllHostsOffered();
	const setHostFilter = useWorkspacesFilterStore(
		(store) => store.setHostFilter,
	);
	const setScopeCloud = useWorkspacesFilterStore(
		(store) => store.setScopeCloud,
	);
	const setScopeAll = useWorkspacesFilterStore((store) => store.setScopeAll);
	const manualUnread = useUnreadWorkspacesStore((state) => state.manualUnread);
	const cloudReadAt = useUnreadWorkspacesStore((state) => state.cloudReadAt);

	const { presence } = useHostsPresence(hosts);

	const sortedHosts = useMemo(
		() =>
			hosts
				.map((host) => ({
					...host,
					isOnline: presence?.get(host.machineId)?.online ?? host.isOnline,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[hosts, presence],
	);

	const countedHosts = allOffered ? sortedHosts : NO_HOSTS;
	const onlineCountedHosts = useMemo(
		() => countedHosts.filter((host) => host.isOnline),
		[countedHosts],
	);
	const { byHost } = useHostsWorkspaces(countedHosts);
	const { attentionByWorkspace } = useHostsTerminals(onlineCountedHosts);
	const { workspaces: activeCloud } = useCloudWorkspaces();
	const cloudFilters = useCloudFilters();

	const countsByPlace = useMemo(() => {
		const counts = new Map<string, AttentionCounts>();
		if (!allOffered) return counts;
		for (const host of onlineCountedHosts) {
			counts.set(
				host.machineId,
				countAttention(
					(byHost.get(host.machineId)?.workspaces ?? [])
						.filter((workspace) => workspace.worktreeExists !== false)
						.map(
							(workspace) =>
								attentionByWorkspace.get(workspace.id) ??
								(manualUnread[workspace.id] ? "review" : null),
						),
				),
			);
		}
		counts.set(
			"cloud",
			countAttention(
				activeCloud
					.filter((row) => cloudFilters.matchesCreator(row.createdByUserId))
					.map((row) =>
						cloudRowAttention(row, cloudReadAt[row.id], !!manualUnread[row.id]),
					),
			),
		);
		return counts;
	}, [
		allOffered,
		onlineCountedHosts,
		byHost,
		attentionByWorkspace,
		manualUnread,
		activeCloud,
		cloudFilters.matchesCreator,
		cloudReadAt,
	]);

	const countsLine = (placeId: string) => {
		const counts = countsByPlace.get(placeId);
		if (!counts) return undefined;
		const parts = [
			counts.input > 0
				? t({
						message: plural(counts.input, {
							one: "# needs input",
							other: "# need input",
						}),
					})
				: null,
			counts.review > 0
				? t({
						message: plural(counts.review, {
							one: "# ready",
							other: "# ready",
						}),
					})
				: null,
			counts.working > 0
				? t({
						message: plural(counts.working, {
							one: "# working",
							other: "# working",
						}),
					})
				: null,
		].filter(Boolean);
		return parts.length > 0 ? parts.join(" · ") : undefined;
	};

	const offlineLine = (lastSeenAt: number | null | undefined) => {
		if (lastSeenAt === undefined) return undefined;
		if (lastSeenAt === null) return t({ message: "Offline" });
		const now = Date.now();
		return t({
			message: `Offline, seen ${formatRelativeTime(getLastSeenTime(lastSeenAt, now), now)}`,
		});
	};

	const close = (filter: "all" | "cloud" | "machine") => {
		posthog.capture("filter_applied", { filter: "host", value: filter });
		router.back();
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-10"
		>
			{allOffered ? (
				<ListRow
					label={t({ message: "All hosts" })}
					trailing={<ListRowCheck visible={scope === "all"} />}
					onPress={() => {
						setScopeAll();
						close("all");
					}}
					isLast={!cloudEnabled && sortedHosts.length === 0}
				/>
			) : null}
			{cloudEnabled ? (
				<ListRow
					icon={
						<Icon
							as={CloudIcon}
							className="text-muted-foreground size-4"
							strokeWidth={2}
						/>
					}
					label={t({ message: "Cloud" })}
					subtitle={countsLine("cloud")}
					trailing={<ListRowCheck visible={scope === "cloud"} />}
					onPress={() => {
						setScopeCloud();
						close("cloud");
					}}
					isLast={sortedHosts.length === 0}
				/>
			) : null}
			{sortedHosts.map((host, index) => (
				<ListRow
					key={host.machineId}
					icon={<HostStatusDot isOnline={host.isOnline} />}
					label={host.name}
					subtitle={
						host.isOnline
							? countsLine(host.machineId)
							: offlineLine(host.lastSeenAt)
					}
					trailing={
						<ListRowCheck
							visible={
								scope === "host" && host.machineId === selectedHost?.machineId
							}
						/>
					}
					onPress={() => {
						setHostFilter(host.machineId);
						close("machine");
					}}
					isLast={index === sortedHosts.length - 1}
				/>
			))}
		</ScrollView>
	);
}
