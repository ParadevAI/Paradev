import type { NativeStackNavigationOptions } from "expo-router";

/** Presents a route as a sheet over the screen it opened from. */
export type SheetScreenOptions = (
	options: NativeStackNavigationOptions,
) => NativeStackNavigationOptions;
