import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { DOCK_CHIP_HEIGHT } from "./constants";

interface DockChipProps {
	label: string;
	count?: number;
	icon?: LucideIcon;
	iconClassName?: string;
	children?: ReactNode;
	onPress: () => void;
}

export function DockChip({
	label,
	count,
	icon,
	iconClassName,
	children,
	onPress,
}: DockChipProps) {
	const content = (
		<View
			className="flex-row items-center gap-2 px-4"
			style={{ height: DOCK_CHIP_HEIGHT }}
		>
			{icon ? (
				<Icon
					as={icon}
					className={cn("text-muted-foreground size-[18px]", iconClassName)}
				/>
			) : null}
			<Text className="text-foreground text-base">{label}</Text>
			{count !== undefined ? (
				<Text className="text-muted-foreground text-base">{count}</Text>
			) : null}
			{children}
		</View>
	);
	return (
		<Pressable accessibilityRole="button" onPress={onPress}>
			{isLiquidGlassAvailable() ? (
				<GlassView
					colorScheme="dark"
					glassEffectStyle="regular"
					isInteractive
					style={{ borderRadius: DOCK_CHIP_HEIGHT / 2 }}
				>
					{content}
				</GlassView>
			) : (
				<View className="rounded-full border border-white/10 bg-[#1C1C1C]">
					{content}
				</View>
			)}
		</Pressable>
	);
}
