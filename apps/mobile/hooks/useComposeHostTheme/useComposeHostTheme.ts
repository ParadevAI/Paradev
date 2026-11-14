import type { HostProps } from "@expo/ui/jetpack-compose";
import { useMemo } from "react";
import { useUniwind } from "uniwind";
import { THEME } from "@/lib/theme";
import { hslToHex } from "./utils/hslToHex";

const RAISED_SURFACE = {
	light: "hsl(0 0% 100%)",
	dark: "hsl(0 0% 9%)",
} as const;

/**
 * `colorScheme` and `colorOverrides` for a Compose `Host`, so Material
 * surfaces use the app's palette and not the wallpaper's.
 */
export function useComposeHostTheme(): Pick<
	HostProps,
	"colorScheme" | "colorOverrides"
> {
	const { theme } = useUniwind();
	return useMemo(() => {
		const colors = THEME[theme];
		const raised = hslToHex(RAISED_SURFACE[theme]);
		return {
			colorScheme: theme,
			colorOverrides: {
				primary: hslToHex(colors.primary),
				onPrimary: hslToHex(colors.primaryForeground),
				background: hslToHex(colors.background),
				onBackground: hslToHex(colors.foreground),
				surface: hslToHex(colors.background),
				onSurface: hslToHex(colors.foreground),
				surfaceVariant: hslToHex(colors.secondary),
				onSurfaceVariant: hslToHex(colors.mutedForeground),
				surfaceTint: hslToHex(colors.background),
				surfaceContainerLowest: raised,
				surfaceContainerLow: raised,
				surfaceContainer: raised,
				surfaceContainerHigh: raised,
				surfaceContainerHighest: hslToHex(colors.secondary),
				secondaryContainer: hslToHex(colors.secondary),
				onSecondaryContainer: hslToHex(colors.secondaryForeground),
				outline: hslToHex(colors.ring),
				outlineVariant: hslToHex(colors.border),
				error: hslToHex(colors.destructive),
			},
		};
	}, [theme]);
}
