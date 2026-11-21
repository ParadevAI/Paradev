import type { NativeStackNavigationOptions } from "expo-router";
import type { ComponentType } from "react";

export interface TitlePressProps {
	onPress: () => void;
}

/** Reports taps on the enclosing native stack screen's title. */
export type TitlePressComponent = ComponentType<TitlePressProps>;

/**
 * The `headerTitle` to set where the native bar cannot report taps itself.
 * Undefined keeps the native title.
 */
export type PressableTitle = (
	onPress: () => void,
) => NativeStackNavigationOptions["headerTitle"];
