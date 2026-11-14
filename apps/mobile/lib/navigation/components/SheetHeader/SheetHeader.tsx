import type { NativeStackHeaderProps } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";
import { SheetHeaderSlot } from "../SheetHeaderSlot";

const SIDE_WIDTH = 48;

/** Drag handle, title and bar items, drawn in JS where the sheet has no native bar. */
export function SheetHeader({ options }: NativeStackHeaderProps) {
	// Never the route name: it is a file path, and a sheet that sets its title
	// once its data loads would show that path until then.
	const title = options.title ?? "";
	const tintColor = THEME.dark.foreground;
	const headerTitle =
		typeof options.headerTitle === "function" ? (
			options.headerTitle({ children: title, tintColor })
		) : (
			<Text
				numberOfLines={1}
				className="text-foreground text-base font-semibold"
			>
				{options.headerTitle ?? title}
			</Text>
		);

	return (
		<SheetHeaderSlot options={options}>
			<View className="pb-2 pt-2">
				<View className="bg-muted-foreground/40 web:hidden h-1 w-8 self-center rounded-full" />
				<View className="min-h-11 flex-row items-center px-2">
					<View style={{ minWidth: SIDE_WIDTH }}>
						{options.headerLeft?.({ tintColor, canGoBack: false })}
					</View>
					<View className="flex-1 items-center px-2">{headerTitle}</View>
					<View className="items-end" style={{ minWidth: SIDE_WIDTH }}>
						{options.headerRight?.({ tintColor, canGoBack: false })}
					</View>
				</View>
			</View>
		</SheetHeaderSlot>
	);
}
