import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { useFormat } from "@superset/i18n/react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { getLastSeenTime } from "@/screens/(authenticated)/(home)/utils/getLastSeenTime";
import type { PlaceStatus } from "@/screens/(authenticated)/(home)/utils/placeStatus";
import { useAttentionLabel } from "../../hooks/useAttentionLabel";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import { AttentionMark } from "../AttentionMark";
import { SECTION_LABEL, SECTION_LABEL_HIT_SLOP } from "../SectionLabel";

interface HostLabelProps {
	name: string;
	status: PlaceStatus;
	/** Null = never reached the relay. */
	lastSeenAt?: number | null;
	/** Asks again whether the machine is online. */
	onRetry?: () => Promise<void>;
	/** The list's first item: no rule above it. */
	first?: boolean;
	/** Folds the place's rows away; absent where the place can't fold. */
	onToggle?: () => void;
	collapsed?: boolean;
	count?: number;
	/** The most urgent state among the rows a collapsed place hides. */
	attention?: TerminalAttention | null;
}

/**
 * Labels the place the rows under it live on, as desktop labels its sidebar
 * sections: muted text at the screen margin, the count, and a
 * caret that stays visible since a phone has no hover.
 */
export function HostLabel({
	name,
	status,
	lastSeenAt,
	onRetry,
	first = false,
	onToggle,
	collapsed = false,
	count = 0,
	attention = null,
}: HostLabelProps) {
	const { t } = useLingui();
	const theme = useTheme();
	const { formatNumber } = useFormat();
	const attentionLabel = useAttentionLabel();
	const enlargedText = useEnlargedText();
	const [checking, setChecking] = useState(false);
	const now = Date.now();
	const statusText =
		status === "unknown"
			? t({ message: "can’t check" })
			: status !== "offline"
				? null
				: typeof lastSeenAt === "number"
					? t({
							message: `offline, seen ${formatRelativeTime(getLastSeenTime(lastSeenAt, now), now)}`,
						})
					: t({ message: "offline" });
	const unreachable = statusText !== null;
	const Caret = collapsed ? ChevronRight : ChevronDown;
	const content = (
		<View
			className={cn(
				"min-w-0 flex-1 flex-row items-center",
				enlargedText && "flex-wrap",
				unreachable && "opacity-60",
			)}
		>
			<Text
				className={cn(SECTION_LABEL.label, "shrink")}
				numberOfLines={enlargedText ? undefined : 1}
			>
				{statusText ? `${name} · ${statusText}` : name}
			</Text>
			{onToggle ? (
				<>
					<Text className={cn(SECTION_LABEL.count, "ml-2")}>
						{formatNumber(count)}
					</Text>
					<View className="ml-1">
						<Caret size={12} color={theme.mutedForeground} strokeWidth={2.5} />
					</View>
					{attention ? (
						<View className="ml-2">
							<AttentionMark attention={attention} />
						</View>
					) : null}
				</>
			) : null}
		</View>
	);
	return (
		<View
			className={cn(SECTION_LABEL.frame(first), "flex-row items-center gap-3")}
		>
			{onToggle ? (
				// The toggle and Try again are siblings so VoiceOver reaches both.
				<Pressable
					onPress={onToggle}
					accessibilityRole="button"
					accessibilityLabel={[
						name,
						t({
							message: plural(count, {
								one: "# workspace",
								other: "# workspaces",
							}),
						}),
						statusText,
						attention ? attentionLabel(attention) : null,
					]
						.filter(Boolean)
						.join(", ")}
					accessibilityState={{ expanded: !collapsed }}
					ph-label="host-header-toggle"
					hitSlop={SECTION_LABEL_HIT_SLOP}
					className="web:hover:opacity-80 min-h-8 min-w-0 flex-1 flex-row items-center active:opacity-60"
				>
					{content}
				</Pressable>
			) : (
				<View className="min-h-8 min-w-0 flex-1 flex-row items-center">
					{content}
				</View>
			)}
			{onRetry && unreachable ? (
				<Pressable
					accessibilityRole="button"
					disabled={checking}
					hitSlop={8}
					ph-label="host-label-retry"
					className="active:opacity-60"
					onPress={() => {
						setChecking(true);
						void onRetry().finally(() => setChecking(false));
					}}
				>
					<Text className="text-primary font-medium text-[14px]">
						{checking
							? t({ message: "Checking…" })
							: t({ message: "Try again" })}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}
