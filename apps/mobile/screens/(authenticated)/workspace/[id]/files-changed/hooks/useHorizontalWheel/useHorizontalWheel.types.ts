import type { RefObject } from "react";
import type { ViewInstance } from "react-native";
import type { SharedValue } from "react-native-reanimated";

export interface HorizontalWheelOptions {
	scrollX: SharedValue<number>;
	maxScrollX: SharedValue<number>;
}

/** A ref for the diff's container; sideways wheel input moves the code panes. */
export type UseHorizontalWheel = (
	options: HorizontalWheelOptions,
) => RefObject<ViewInstance | null>;
