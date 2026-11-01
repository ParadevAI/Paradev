import type { NativeStackNavigationOptions } from "expo-router";

/** A route `sheetScreenOptions` presents as a sheet on the web: a transparent modal with detents. */
export const isWebSheet = (
	options: NativeStackNavigationOptions,
): options is NativeStackNavigationOptions & {
	sheetAllowedDetents: number[];
} =>
	options.presentation === "transparentModal" &&
	Array.isArray(options.sheetAllowedDetents);
