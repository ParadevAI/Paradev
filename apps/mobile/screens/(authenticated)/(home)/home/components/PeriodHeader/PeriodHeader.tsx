import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";

export function PeriodHeader({ label }: { label: string }) {
	const enlargedText = useEnlargedText();
	return (
		<View className="px-4 pb-1 pt-5">
			<Text
				className="text-muted-foreground font-medium text-[14px]"
				numberOfLines={enlargedText ? undefined : 1}
			>
				{label}
			</Text>
		</View>
	);
}
