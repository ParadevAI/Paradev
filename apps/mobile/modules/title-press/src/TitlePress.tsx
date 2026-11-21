import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import type { PressableTitle, TitlePressComponent } from "./TitlePress.types";

export const TitlePress: TitlePressComponent = () => null;

export const pressableTitle: PressableTitle =
	(onPress) =>
	({ children }) => (
		<Pressable
			accessibilityRole="button"
			hitSlop={8}
			className="active:opacity-60"
			onPress={onPress}
		>
			<Text numberOfLines={1} className="text-foreground text-lg font-medium">
				{children}
			</Text>
		</Pressable>
	);
