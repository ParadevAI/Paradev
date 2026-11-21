import { THEME } from "@/lib/theme";
import type { GlassHeaderOptions } from "./glassHeaderOptions.types";

/** Opaque: nothing blurs content under the bar, so content starts below it. */
export const glassHeaderOptions: GlassHeaderOptions = {
	headerShown: true,
	headerTransparent: false,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	headerStyle: { backgroundColor: THEME.dark.background },
};
