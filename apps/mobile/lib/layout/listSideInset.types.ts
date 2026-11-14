import type { ViewStyle } from "react-native";

/** Where a LegendList's side padding goes: on its content, or on each row. */
export interface ListSideInset {
	content: ViewStyle | undefined;
	row: ViewStyle | undefined;
}

export type ListSideInsetFor = (inset: number) => ListSideInset;
