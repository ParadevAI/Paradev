import { StyleSheet, View } from "react-native";

const NAME_COLUMN = 52;
const GROUPED_NAME_COLUMN = 68;
const MARGIN = 16;

/** A row's bottom hairline, from the name column to the margin; absolute so it adds no height. */
export function RowHairline({ grouped = false }: { grouped?: boolean }) {
	return (
		<View
			pointerEvents="none"
			className="bg-border absolute bottom-0"
			style={{
				left: grouped ? GROUPED_NAME_COLUMN : NAME_COLUMN,
				right: MARGIN,
				height: StyleSheet.hairlineWidth,
			}}
		/>
	);
}
