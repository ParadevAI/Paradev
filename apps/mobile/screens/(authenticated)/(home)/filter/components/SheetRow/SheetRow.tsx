import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { RowHairline } from "@/screens/(authenticated)/(home)/components/RowHairline";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";

/**
 * A filter sheet's row on Home's list grid: 16pt margins, a 24pt lead slot,
 * the name at 52pt, a 24pt check slot at the trailing edge, 64pt tall.
 */
export function SheetRow({
	icon,
	label,
	subtitle,
	trailing,
	checked,
	onPress,
	isLast = false,
}: {
	/** Left empty, the slot still holds the name at 52pt. */
	icon?: ReactNode;
	label: string;
	subtitle?: string;
	/** Shown before the check slot, e.g. a count or the current value. */
	trailing?: ReactNode;
	/** Set on pick-one rows; reserves the check slot whether ticked or not. */
	checked?: boolean;
	onPress?: () => void;
	isLast?: boolean;
}) {
	const enlargedText = useEnlargedText();
	return (
		<Pressable
			onPress={onPress}
			disabled={!onPress}
			accessibilityRole="button"
			accessibilityState={
				checked === undefined ? undefined : { selected: checked }
			}
			// Not the row's own label: some of these are host names.
			ph-label="sheet-row"
			className="web:hover:opacity-80 min-h-16 flex-row items-center gap-3 px-4 py-2 active:opacity-60"
		>
			<View className="size-6 items-center justify-center">{icon}</View>
			<View className="min-w-0 flex-1">
				<Text
					className="text-foreground text-[16px]"
					numberOfLines={enlargedText ? undefined : 1}
				>
					{label}
				</Text>
				{subtitle ? (
					<Text
						className="text-muted-foreground mt-1 text-[14px]"
						numberOfLines={enlargedText ? undefined : 1}
					>
						{subtitle}
					</Text>
				) : null}
			</View>
			{trailing ? (
				<View className="max-w-[60%] flex-row items-center justify-end gap-2">
					{trailing}
				</View>
			) : null}
			{checked === undefined ? null : (
				<View className="size-6 items-center justify-center">
					<ListRowCheck visible={checked} />
				</View>
			)}
			{isLast ? null : <RowHairline />}
		</Pressable>
	);
}
