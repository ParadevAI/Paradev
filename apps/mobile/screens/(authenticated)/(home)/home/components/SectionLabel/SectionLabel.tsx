import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { cn } from "@/lib/utils";
import { SECTION_LABEL } from "./sectionLabelClasses";

/** A section label that does not fold, as Needs me's groups use. */
export function SectionLabel({
	label,
	first = false,
}: {
	label: string;
	first?: boolean;
}) {
	const enlargedText = useEnlargedText();
	return (
		<View
			className={cn(
				SECTION_LABEL.frame(first),
				SECTION_LABEL.row,
				"justify-center",
			)}
		>
			<Text
				accessibilityRole="header"
				className={SECTION_LABEL.label}
				numberOfLines={enlargedText ? undefined : 1}
			>
				{label}
			</Text>
		</View>
	);
}
