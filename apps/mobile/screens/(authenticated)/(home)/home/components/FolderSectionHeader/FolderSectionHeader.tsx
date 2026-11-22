import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { useTheme } from "@/hooks/useTheme";
import { useAttentionLabel } from "../../hooks/useAttentionLabel";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import type { GroupBarSpan } from "../../types";
import { AttentionMark } from "../AttentionMark";
import { GroupBar } from "../GroupBar";
import {
	FolderHeaderMenu,
	type FolderHeaderMenuProps,
} from "./components/FolderHeaderMenu";

interface FolderSectionHeaderProps {
	name: string;
	/** A desktop folder color: a CSS color, or null for none. */
	color: string | null;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
	/** The most urgent state of the rows a collapsed group hides. */
	attention?: TerminalAttention | null;
	/** Group actions; absent where the group cannot be changed from here. */
	menu?: Omit<FolderHeaderMenuProps, "color">;
	/** This header's piece of the group's colour bar; none without a colour. */
	bar?: GroupBarSpan | null;
}

export function FolderSectionHeader({
	name,
	color,
	count,
	collapsed,
	onToggle,
	attention,
	menu,
	bar,
}: FolderSectionHeaderProps) {
	const attentionLabel = useAttentionLabel();
	const { t } = useLingui();
	const theme = useTheme();
	const enlargedText = useEnlargedText();
	const Caret = collapsed ? ChevronRight : ChevronDown;
	return (
		// The toggle and the menu are siblings so VoiceOver reaches both.
		<View className="flex-row items-center px-4 pt-1">
			{bar ? <GroupBar span={bar} /> : null}
			<Pressable
				onPress={onToggle}
				accessibilityRole="button"
				accessibilityLabel={[
					t({
						message: `${name} group, ${plural(count, {
							one: "# workspace",
							other: "# workspaces",
						})}`,
					}),
					attention ? attentionLabel(attention) : null,
				]
					.filter(Boolean)
					.join(", ")}
				accessibilityState={{ expanded: !collapsed }}
				className="web:hover:opacity-80 min-h-11 flex-1 flex-row items-center gap-3 active:opacity-60"
			>
				<View className="size-6 items-center justify-center">
					<Caret size={12} color={theme.mutedForeground} strokeWidth={2.5} />
				</View>
				<View className="shrink flex-row items-center gap-2">
					<Text
						className="text-muted-foreground shrink text-[16px]"
						numberOfLines={enlargedText ? undefined : 1}
					>
						{name}
					</Text>
					<Text className="text-muted-foreground text-[14px] tabular-nums">
						{count}
					</Text>
					{attention ? <AttentionMark attention={attention} /> : null}
				</View>
			</Pressable>
			{menu ? <FolderHeaderMenu color={color} {...menu} /> : null}
		</View>
	);
}
