import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { GranteeAvatar } from "../../../components/GranteeAvatar";
import { SelectionTick } from "./components/SelectionTick";

export function SuggestionRow({
	icon,
	dashed,
	person,
	title,
	detail,
	trailing,
	error,
	selected,
	accessory,
	disabled,
	onPress,
}: {
	icon?: LucideIcon;
	dashed?: boolean;
	person?: { name: string; image: string | null };
	title: string;
	detail?: string;
	trailing?: string;
	error?: string;
	/** Shows a tick circle, filled when true. */
	selected?: boolean;
	/** Shown before the tick, such as the pick's role. */
	accessory?: ReactNode;
	disabled?: boolean;
	onPress?: () => void;
}) {
	const state = {
		disabled: Boolean(disabled),
		selected: Boolean(selected),
	};
	return (
		<View
			className={cn(
				"min-h-14 flex-row items-center gap-3",
				disabled && "opacity-55",
			)}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityState={state}
				disabled={disabled || !onPress}
				onPress={onPress}
				className="min-w-0 flex-1 flex-row items-center gap-3 py-2 active:opacity-60"
			>
				{person ? (
					<GranteeAvatar
						kind="person"
						name={person.name}
						image={person.image}
					/>
				) : icon ? (
					<GranteeAvatar kind="icon" icon={icon} dashed={dashed} />
				) : null}
				<View className="min-w-0 flex-1">
					<Text className="text-base" numberOfLines={1}>
						{title}
					</Text>
					{detail ? (
						<Text className="text-muted-foreground text-sm" numberOfLines={1}>
							{detail}
						</Text>
					) : null}
					{error ? (
						<Text className="text-destructive text-xs">{error}</Text>
					) : null}
				</View>
				{trailing ? (
					<Text className="text-muted-foreground shrink-0 text-xs">
						{trailing}
					</Text>
				) : null}
			</Pressable>
			{accessory}
			{selected === undefined ? null : (
				<Pressable
					accessibilityRole="checkbox"
					accessibilityLabel={title}
					accessibilityState={{ ...state, checked: Boolean(selected) }}
					disabled={disabled || !onPress}
					onPress={onPress}
					hitSlop={10}
					className="active:opacity-60"
				>
					<SelectionTick selected={selected} />
				</Pressable>
			)}
		</View>
	);
}
