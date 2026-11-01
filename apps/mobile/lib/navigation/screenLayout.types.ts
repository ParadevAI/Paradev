import type { NativeStackNavigationOptions } from "expo-router";
import type { ReactElement } from "react";

export interface ScreenLayoutProps {
	navigation: { goBack: () => void };
	options: NativeStackNavigationOptions;
	children: ReactElement;
}

/** A stack's `screenLayout`: wraps each screen where the platform needs it. */
export type ScreenLayout =
	| ((props: ScreenLayoutProps) => ReactElement)
	| undefined;
