import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { getLastSeenTime } from "@/screens/(authenticated)/(home)/utils/getLastSeenTime";
import type { PlaceStatus } from "@/screens/(authenticated)/(home)/utils/placeStatus";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { useAttentionLabel } from "../../hooks/useAttentionLabel";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import { AttentionMark } from "../AttentionMark";

interface HostLabelProps {
	name: string;
	cloud: boolean;
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
 * Titles the place the rows under it live on. A rule above it, not a bigger
 * size, marks it as the list's top level.
 */
export function HostLabel({
	name,
	cloud,
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
		<>
			<View className="size-6 items-center justify-center">
				{cloud ? (
					<Icon
						as={CloudIcon}
						className="text-foreground/70 size-4"
						strokeWidth={2}
					/>
				) : (
					<HostStatusDot isOnline={status === "online"} />
				)}
			</View>
			<View
				className={cn(
					"min-w-0 flex-1 flex-row items-center gap-x-2",
					enlargedText && "flex-wrap",
				)}
			>
				<Text
					className={cn(
						"text-foreground shrink font-semibold text-[17px]",
						unreachable && "opacity-60",
					)}
					numberOfLines={enlargedText ? undefined : 1}
				>
					{name}
				</Text>
				{onToggle ? (
					<>
						<Text className="text-muted-foreground font-mono text-[13px]">
							{count}
						</Text>
						<Caret size={12} color={theme.mutedForeground} strokeWidth={2.5} />
						{attention ? <AttentionMark attention={attention} /> : null}
					</>
				) : null}
				{statusText ? (
					<Text
						className="text-muted-foreground shrink text-[13px] opacity-60"
						numberOfLines={enlargedText ? undefined : 1}
					>
						{statusText}
					</Text>
				) : null}
			</View>
		</>
	);
	return (
		<View
			className={cn(
				"flex-row items-center gap-3 px-4 pb-1 pt-2",
				!first && "border-border mt-3",
			)}
			style={first ? undefined : { borderTopWidth: StyleSheet.hairlineWidth }}
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
					className="web:hover:opacity-80 min-h-11 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-60"
				>
					{content}
				</Pressable>
			) : (
				<View className="min-w-0 flex-1 flex-row items-center gap-3">
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
					<Text className="text-primary font-medium text-[13px]">
						{checking
							? t({ message: "Checking…" })
							: t({ message: "Try again" })}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}
