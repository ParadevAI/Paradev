import { View } from "react-native";
import { Text } from "@/components/ui/text";

/** One muted line under a place label that has no rows to list. */
export function PlaceEmptyNote({ label }: { label: string }) {
	return (
		<View className="px-3 pb-1 pl-7">
			<Text className="text-muted-foreground text-[13px]">{label}</Text>
		</View>
	);
}
