import { useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { cn } from "@/lib/utils";
import { getLastSeenTime } from "@/screens/(authenticated)/(home)/utils/getLastSeenTime";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";

interface HostLabelProps {
	name: string;
	cloud: boolean;
	online: boolean;
	/** Null = never reached the relay; undefined = presence unavailable. */
	lastSeenAt?: number | null;
}

/** Names the place the rows under it live on. A label, not a level. */
export function HostLabel({ name, cloud, online, lastSeenAt }: HostLabelProps) {
	const { t } = useLingui();
	const enlargedText = useEnlargedText();
	const now = Date.now();
	const status = online
		? null
		: lastSeenAt === undefined
			? t({ message: "can’t check" })
			: lastSeenAt === null
				? t({ message: "offline" })
				: t({
						message: `offline, seen ${formatRelativeTime(getLastSeenTime(lastSeenAt, now), now)}`,
					});
	return (
		<View
			className={cn(
				"flex-row items-center gap-3 px-4 pb-1 pt-5",
				!online && "opacity-60",
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
					<HostStatusDot isOnline={online} />
				)}
			</View>
			<Text
				className="text-muted-foreground shrink font-medium text-[13px]"
				numberOfLines={enlargedText ? undefined : 1}
			>
				{status ? `${name} · ${status}` : name}
			</Text>
		</View>
	);
}
