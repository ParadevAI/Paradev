import { ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import type { WorkspaceScope } from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { Chip } from "./components/Chip";
import { CloudFilterChips } from "./components/CloudFilterChips";
import { NeedsMeChip } from "./components/NeedsMeChip";

interface ScopeBarProps {
	scope: WorkspaceScope;
	label: string;
	hostOnline: boolean;
	sortLabel: string | null;
	onPressScope: () => void;
	onPressSort: () => void;
	needsMe: { count: number; active: boolean; onPress: () => void } | null;
}

/**
 * Names the scope the list is actually under. The host and sort were only ever
 * legible from inside the filter sheet, which is why a cold start never told
 * you which machine you were looking at. It holds during search too, because
 * search is scoped to the same place — matches elsewhere are offered as a tail
 * rather than silently mixed in.
 *
 * Cloud gets the cloud glyph rather than a status dot: a sandbox isn't a
 * machine of yours that can be asleep, and dressing it as one invites the
 * question of which computer it is.
 */
export function ScopeBar({
	scope,
	label,
	hostOnline,
	sortLabel,
	onPressScope,
	onPressSort,
	needsMe,
}: ScopeBarProps) {
	const cloud = scope === "cloud";
	return (
		<ScrollView
			horizontal
			className="grow-0"
			showsHorizontalScrollIndicator={false}
			contentContainerClassName="flex-row items-center gap-2 px-4 pb-2 pt-1"
		>
			{label ? (
				<Chip
					label={label}
					leading={
						cloud ? (
							<Icon
								as={CloudIcon}
								className="text-muted-foreground size-3.5"
								strokeWidth={2}
							/>
						) : (
							<HostStatusDot isOnline={hostOnline} />
						)
					}
					onPress={onPressScope}
				/>
			) : null}
			{needsMe ? (
				<NeedsMeChip
					count={needsMe.count}
					active={needsMe.active}
					onPress={needsMe.onPress}
				/>
			) : null}
			{cloud && !needsMe?.active ? <CloudFilterChips /> : null}
			{sortLabel && !needsMe?.active ? (
				<Chip label={sortLabel} onPress={onPressSort} />
			) : null}
		</ScrollView>
	);
}
