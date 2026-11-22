import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { cn } from "@/lib/utils";
import { RowHairline } from "@/screens/(authenticated)/(home)/components/RowHairline";
import { LIST_GRID } from "@/screens/(authenticated)/(home)/utils/listGrid";
import type { GroupBarSpan } from "../../types";
import { GroupBar } from "../GroupBar";
import { RowDetailLine, type RowDetailPart } from "../RowDetailLine";

/**
 * A workspace row's layout, shared by host, Cloud and search rows: the
 * mark in a 24pt lead slot, the name at 52pt (68pt in a group), the detail
 * line under it, anything trailing, 64pt tall.
 */
export function WorkspaceRowFrame({
	lead,
	name,
	nameMuted = false,
	detailParts,
	trailing,
	card = false,
	grouped = false,
	bar = null,
	separator = false,
	onPress,
	disabled = false,
	accessibilityLabel,
	phLabel,
}: {
	lead: ReactNode;
	name: string;
	nameMuted?: boolean;
	detailParts: RowDetailPart[];
	trailing?: ReactNode;
	/** A cell of Home's wide grid rather than a row of the list. */
	card?: boolean;
	grouped?: boolean;
	bar?: GroupBarSpan | null;
	/** Draws a hairline under the row. */
	separator?: boolean;
	onPress: () => void;
	disabled?: boolean;
	accessibilityLabel: string;
	phLabel: string;
}) {
	const enlargedText = useEnlargedText();
	const inGroup = !card && grouped;
	return (
		// Default press behavior on purpose: the system context-menu lift owns
		// the hold animation, and custom press feedback fights it.
		<Pressable
			className={cn(
				"bg-background web:hover:bg-accent/60 min-h-16 flex-row items-center gap-3 rounded-xl py-2",
				card
					? "px-3"
					: inGroup
						? LIST_GRID.rowPadding.grouped
						: LIST_GRID.rowPadding.plain,
			)}
			onPress={onPress}
			disabled={disabled}
			accessibilityState={{ disabled }}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			ph-label={phLabel}
		>
			{bar && inGroup ? <GroupBar span={bar} /> : null}
			{lead}
			<View className="min-w-0 flex-1">
				<Text
					className={cn("text-[16px]", nameMuted && "text-muted-foreground")}
					numberOfLines={enlargedText ? undefined : 1}
				>
					{name}
				</Text>
				<RowDetailLine parts={detailParts} />
			</View>
			{trailing}
			{separator && !card ? <RowHairline grouped={inGroup} /> : null}
		</Pressable>
	);
}
