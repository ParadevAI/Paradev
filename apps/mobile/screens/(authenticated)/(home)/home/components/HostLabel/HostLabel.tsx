import { useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { cn } from "@/lib/utils";
import { getLastSeenTime } from "@/screens/(authenticated)/(home)/utils/getLastSeenTime";
import type { PlaceStatus } from "@/screens/(authenticated)/(home)/utils/placeStatus";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";

interface HostLabelProps {
	name: string;
	cloud: boolean;
	status: PlaceStatus;
	/** Null = never reached the relay. */
	lastSeenAt?: number | null;
	/** Asks again whether the machine is online. */
	onRetry?: () => Promise<void>;
}

/** Names the place the rows under it live on. A label, not a level. */
export function HostLabel({
	name,
	cloud,
	status,
	lastSeenAt,
	onRetry,
}: HostLabelProps) {
	const { t } = useLingui();
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
	return (
		<View className="flex-row items-center gap-3 px-4 pb-1 pt-5">
			<View
				className={cn(
					"min-w-0 flex-1 flex-row items-center gap-3",
					unreachable && "opacity-60",
				)}
			>
				<View className="size-6 items-center justify-center">
					{cloud ? (
						<Icon
							as={CloudIcon}
							className="text-muted-foreground size-3"
							strokeWidth={2}
						/>
					) : (
						<HostStatusDot isOnline={status === "online"} />
					)}
				</View>
				<Text
					className="text-muted-foreground shrink font-medium text-[13px]"
					numberOfLines={enlargedText ? undefined : 1}
				>
					{statusText ? `${name} · ${statusText}` : name}
				</Text>
			</View>
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
