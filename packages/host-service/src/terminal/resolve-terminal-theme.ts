import type { TerminalColors } from "@superset/shared/terminal-colors";
import type {
	HostTerminalTheme,
	TerminalThemeType,
} from "../trpc/router/settings/terminal-theme.ts";

function relativeLuminance(hex: string): number {
	const channel = (offset: number) => {
		const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function themeTypeForColors(colors: TerminalColors): TerminalThemeType {
	return relativeLuminance(colors.background) > 0.5 ? "light" : "dark";
}

/**
 * What a new PTY gets: the caller's explicit theme first, then the theme its
 * colors imply, then the host's stored theme. Stored colors apply only when
 * they belong to the resolved theme type, so an explicit `--theme dark` never
 * answers OSC 11 with a light background.
 */
export function resolveTerminalTheme(params: {
	themeType?: TerminalThemeType;
	colors?: TerminalColors;
	hostTheme: HostTerminalTheme | null;
}): { themeType?: TerminalThemeType; colors?: TerminalColors } {
	const { hostTheme } = params;
	const themeType =
		params.themeType ??
		(params.colors ? themeTypeForColors(params.colors) : undefined) ??
		hostTheme?.themeType;
	const colors =
		params.colors ??
		(hostTheme && hostTheme.themeType === themeType
			? hostTheme.colors
			: undefined);
	return { themeType, colors };
}
