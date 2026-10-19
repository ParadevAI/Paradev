import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { DOCK_CHIP_HEIGHT } from "./constants";

interface DockChipProps {
	label: string;
	count?: number;
	icon?: LucideIcon;
	iconClassName?: string;
	trailing?: ReactNode;
	onPress: () => void;
}

export function DockChip({
	label,
	count,
	icon,
	iconClassName = "text-muted-foreground",
	trailing,
	onPress,
}: DockChipProps) {
	return (
		<Pressable
			accessibilityRole="button"
			className="flex-row items-center gap-2 rounded-full border border-white/10 bg-[#1C1C1C] px-4 active:opacity-70"
			onPress={onPress}
			style={{ height: DOCK_CHIP_HEIGHT }}
		>
			{icon ? (
				<Icon as={icon} className={`size-[18px] ${iconClassName}`} />
			) : null}
			<Text className="text-foreground text-base">{label}</Text>
			{count !== undefined ? (
				<Text className="text-muted-foreground text-base">{count}</Text>
			) : null}
			{trailing}
		</Pressable>
	);
}
