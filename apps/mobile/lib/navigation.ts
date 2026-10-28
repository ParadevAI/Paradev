import { isLiquidGlassAvailable } from "expo-glass-effect";
import type { NativeStackNavigationOptions } from "expo-router";
import { createElement, type ReactElement } from "react";
import { Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const titledScreenOptions: NativeStackNavigationOptions = {
	headerShadowVisible: false,
};

/** A sheet's native header: transparent, glass where the OS draws it, content scrolling underneath. */
export const glassHeaderOptions = {
	headerShown: true,
	headerTransparent: true,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	...(isLiquidGlassAvailable()
		? {}
		: { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
} as const;

// iPad shows a form sheet as a fixed-size centered card, so a partial detent
// only shrinks the card and clips what is inside it.
export const sheetDetents = (phoneDetents: number[]) =>
	Platform.OS === "ios" && Platform.isPad ? [1.0] : phoneDetents;

/**
 * Pads a screen by its own side safe area, measured natively: a full-screen
 * route clears the iPhone Duo's right-edge button column, and a form sheet
 * floating inside the safe area gets no padding. A transparent modal draws
 * over the whole window, so it is left alone.
 */
export const sideSafeAreaLayout = ({
	options,
	children,
}: {
	options: NativeStackNavigationOptions;
	children: ReactElement;
}) =>
	options.presentation === "transparentModal"
		? children
		: createElement(
				SafeAreaView,
				{ edges: ["left", "right"], style: { flex: 1 } },
				children,
			);
