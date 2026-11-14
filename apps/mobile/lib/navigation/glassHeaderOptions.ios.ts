import { isLiquidGlassAvailable } from "expo-glass-effect";
import type { GlassHeaderOptions } from "./glassHeaderOptions.types";

/** Transparent, glass where the OS draws it, content scrolling underneath. */
export const glassHeaderOptions: GlassHeaderOptions = {
	headerShown: true,
	headerTransparent: true,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	...(isLiquidGlassAvailable()
		? {}
		: { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
};
