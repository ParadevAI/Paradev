import { StyleSheet, View } from "react-native";
import { LIST_GRID } from "@/screens/(authenticated)/(home)/utils/listGrid";

/** A row's bottom hairline, from the name column to the margin; absolute so it adds no height. */
export function RowHairline({ grouped = false }: { grouped?: boolean }) {
	return (
		<View
			pointerEvents="none"
			className="bg-border absolute bottom-0"
			style={{
				left: grouped ? LIST_GRID.groupedNameColumn : LIST_GRID.nameColumn,
				right: LIST_GRID.margin,
				height: StyleSheet.hairlineWidth,
			}}
		/>
	);
}
