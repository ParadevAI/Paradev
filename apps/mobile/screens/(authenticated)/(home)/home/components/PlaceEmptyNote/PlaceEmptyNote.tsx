import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/ui/text";
import { LIST_GRID } from "@/screens/(authenticated)/(home)/utils/listGrid";

/** One muted line under a place label with no rows; a spinner while it loads. */
export function PlaceEmptyNote({ label }: { label: string | null }) {
	return (
		<View
			className="items-start pb-1"
			style={{
				paddingLeft: LIST_GRID.nameColumn,
				paddingRight: LIST_GRID.margin,
			}}
		>
			{label === null ? (
				<ActivityIndicator size="small" />
			) : (
				<Text className="text-muted-foreground text-[14px]">{label}</Text>
			)}
		</View>
	);
}
