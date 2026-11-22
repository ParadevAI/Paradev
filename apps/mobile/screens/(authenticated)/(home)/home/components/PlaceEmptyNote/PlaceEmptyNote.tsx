import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/ui/text";

/** One muted line under a place label with no rows; a spinner while it loads. */
export function PlaceEmptyNote({ label }: { label: string | null }) {
	return (
		<View className="items-start pb-1 pl-13 pr-4">
			{label === null ? (
				<ActivityIndicator size="small" />
			) : (
				<Text className="text-muted-foreground text-[14px]">{label}</Text>
			)}
		</View>
	);
}
