import type { NativeStackNavigationOptions } from "expo-router";
import type { ReactNode } from "react";

/** Wraps a sheet's JS header, which the stack renders, so it shows where the platform draws that sheet. */
export type SheetHeaderSlotComponent = (props: {
	options: NativeStackNavigationOptions;
	children: ReactNode;
}) => ReactNode;
