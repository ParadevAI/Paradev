import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useHostsWorkspaces } from "@/hooks/useHostWorkspaces";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { posthog } from "@/lib/posthog";
import { SheetRow } from "@/screens/(authenticated)/(home)/filter/components/SheetRow";
import { useHostsTerminals } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import {
	type AttentionCounts,
	countAttention,
} from "@/screens/(authenticated)/(home)/home/utils/needsMe";
import { useCloudFilters } from "@/screens/(authenticated)/(home)/hooks/useCloudFilters";
import { useRowAttention } from "@/screens/(authenticated)/(home)/hooks/useRowAttention";
import { useScopeSelection } from "@/screens/(authenticated)/(home)/hooks/useScopeSelection";
import { getLastSeenTime } from "@/screens/(authenticated)/(home)/utils/getLastSeenTime";
import {
	canTickHost,
	everythingSelection,
	MAX_SELECTED_HOSTS,
	type ScopeSelection,
	toggleCloud,
	toggleHost,
} from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";

/**
 * Which places the list shows: Cloud and up to three machines, each ticked
 * on its own; at least one stays ticked. The sheet stays open while you
 * tick. Counts show for every row only in an org of three machines or
 * fewer; past that, only for ticked machines, since Home never asks more.
 */
export function ScopeFilterScreen() {
	const { t } = useLingui();
	const { hosts } = useOrgHosts();
	const { selection, cloudEnabled, allOffered, everything } =
		useScopeSelection();
	const setSelection = useWorkspacesFilterStore((store) => store.setSelection);

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

	const smallOrg = sortedHosts.length <= MAX_SELECTED_HOSTS;
	const countedHosts = useMemo(
		() =>
			smallOrg
				? sortedHosts
				: sortedHosts.filter((host) =>
						selection.hosts.includes(host.machineId),
					),
		[smallOrg, sortedHosts, selection.hosts],
	);
	const onlineCountedHosts = useMemo(
		() => countedHosts.filter((host) => host.isOnline),
		[countedHosts],
	);
	const { byHost } = useHostsWorkspaces(countedHosts);
	const { attentionByWorkspace } = useHostsTerminals(onlineCountedHosts);
	const rowAttention = useRowAttention(attentionByWorkspace);
	const { workspaces: activeCloud } = useCloudWorkspaces();
	const cloudFilters = useCloudFilters();

	const countsByPlace = useMemo(() => {
		const counts = new Map<string, AttentionCounts>();
		for (const host of onlineCountedHosts) {
			counts.set(
				host.machineId,
				countAttention(
					(byHost.get(host.machineId)?.workspaces ?? [])
						.filter((workspace) => workspace.worktreeExists !== false)
						.map(rowAttention.host),
				),
			);
		}
		counts.set(
			"cloud",
			countAttention(
				activeCloud
					.filter((row) => cloudFilters.matchesCreator(row.createdByUserId))
					.map(rowAttention.cloud),
			),
		);
		return counts;
	}, [
		onlineCountedHosts,
		byHost,
		rowAttention,
		activeCloud,
		cloudFilters.matchesCreator,
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

	const apply = (next: ScopeSelection, filter: "all" | "cloud" | "machine") => {
		if (next === selection) return;
		setSelection(next);
		posthog.capture("filter_applied", { filter: "host", value: filter });
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="pb-10"
		>
			{allOffered ? (
				<SheetRow
					label={t({ message: "All hosts" })}
					checked={everything}
					onPress={() =>
						apply(everythingSelection(sortedHosts, cloudEnabled), "all")
					}
					isLast={!cloudEnabled && sortedHosts.length === 0}
				/>
			) : null}
			{cloudEnabled ? (
				<SheetRow
					icon={
						<Icon
							as={CloudIcon}
							className="text-muted-foreground size-4"
							strokeWidth={2}
						/>
					}
					label={t({ message: "Cloud" })}
					subtitle={countsLine("cloud")}
					checked={selection.cloud}
					onPress={() => apply(toggleCloud(selection), "cloud")}
					isLast={sortedHosts.length === 0}
				/>
			) : null}
			{sortedHosts.map((host, index) => {
				const ticked = selection.hosts.includes(host.machineId);
				const tickable = canTickHost(selection, host.machineId);
				const showStatus = smallOrg || ticked;
				return (
					<View
						key={host.machineId}
						className={tickable ? undefined : "opacity-50"}
					>
						<SheetRow
							icon={<HostStatusDot isOnline={host.isOnline} />}
							label={host.name}
							subtitle={
								!tickable
									? t({ message: "Up to 3 hosts at a time" })
									: !showStatus
										? undefined
										: host.isOnline
											? countsLine(host.machineId)
											: offlineLine(host.lastSeenAt)
							}
							checked={ticked}
							onPress={
								tickable
									? () =>
											apply(toggleHost(selection, host.machineId), "machine")
									: undefined
							}
							isLast={index === sortedHosts.length - 1}
						/>
					</View>
				);
			})}
		</ScrollView>
	);
}
