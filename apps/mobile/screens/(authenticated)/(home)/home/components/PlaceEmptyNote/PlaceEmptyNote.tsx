import { View } from "react-native";
import { Text } from "@/components/ui/text";

/** One muted line under a place label that has no rows to list. */
export function PlaceEmptyNote({ label }: { label: string }) {
	return (
		<View className="pb-1 pl-13 pr-4">
			<Text className="text-muted-foreground text-[13px]">{label}</Text>
		</View>
	);
}
