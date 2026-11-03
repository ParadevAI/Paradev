import type { Theme } from "../types";

/**
 * Light theme - based on the original Superset light mode colors
 */
export const lightTheme: Theme = {
	id: "light",
	name: "Light",
	author: "Paradev",
	type: "light",
	isBuiltIn: true,

	ui: {
		background: "#fafaf8",
		foreground: "#2c2a28",
		card: "#ffffff",
		cardForeground: "#2c2a28",
		popover: "#ffffff",
		popoverForeground: "#2c2a28",
		primary: "#2c2a28",
		primaryForeground: "#fafaf8",
		secondary: "#eceae8",
		secondaryForeground: "#2c2a28",
		muted: "#eceae8",
		mutedForeground: "#625f5d",
		accent: "#e6e4e2",
		accentForeground: "#2c2a28",
		tertiary: "oklch(0.95 0.003 40)",
		tertiaryActive: "oklch(0.90 0.003 40)",
		destructive: "oklch(0.577 0.245 27.325)",
		destructiveForeground: "oklch(0.985 0 0)",
		warning: "#906d00",
		warningForeground: "#ffffff",
		success: "#00c950",
		border: "#e2e0de",
		input: "#d8d6d4",
		ring: "#878482",
		sidebar: "#eceae8",
		sidebarForeground: "#2c2a28",
		sidebarPrimary: "#2c2a28",
		sidebarPrimaryForeground: "#fafaf8",
		sidebarAccent: "#dddbd9",
		sidebarAccentForeground: "#2c2a28",
		sidebarBorder: "#e2e0de",
		sidebarRing: "#878482",
		chart1: "oklch(0.646 0.222 41.116)",
		chart2: "oklch(0.6 0.118 184.704)",
		chart3: "oklch(0.398 0.07 227.392)",
		chart4: "oklch(0.828 0.189 84.429)",
		chart5: "oklch(0.769 0.188 70.08)",

		// Search highlights
		highlightMatch: "rgba(255, 211, 61, 0.35)",
		highlightActive: "rgba(255, 150, 50, 0.55)",

		// Brand highlight - warm chart-1 orange
		highlight: "oklch(0.646 0.222 41.116)",
		highlightForeground: "oklch(0.985 0 0)",
	},

	terminal: {
		background: "#fafaf8",
		foreground: "#000000",
		cursor: "#000000",
		cursorAccent: "#fafaf8",
		selectionBackground: "#add6ff",

		// Standard ANSI colors (xterm defaults)
		black: "#2e3436",
		red: "#cc0000",
		green: "#4e9a06",
		yellow: "#c4a000",
		blue: "#3465a4",
		magenta: "#75507b",
		cyan: "#06989a",
		white: "#d3d7cf",

		// Bright ANSI colors (xterm defaults)
		brightBlack: "#555753",
		brightRed: "#ef2929",
		brightGreen: "#8ae234",
		brightYellow: "#fce94f",
		brightBlue: "#729fcf",
		brightMagenta: "#ad7fa8",
		brightCyan: "#34e2e2",
		brightWhite: "#eeeeec",
	},
};
