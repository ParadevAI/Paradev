import { z } from "zod";
import type { TerminalColors, UIColors } from "./types";

const t3SkinSchema = z.object({
	id: z.string().optional(),
	name: z.string(),
	appearance: z.enum(["dark", "light"]),
	colors: z.record(z.string(), z.string()),
	css: z.string().optional(),
});

const UI_FROM_T3: Partial<Record<keyof UIColors, string>> = {
	background: "canvas",
	foreground: "text",
	card: "surfaceRaised",
	cardForeground: "text",
	popover: "surfaceOverlay",
	popoverForeground: "text",
	primary: "accent",
	primaryForeground: "accentForeground",
	secondary: "secondary",
	secondaryForeground: "secondaryForeground",
	muted: "muted",
	mutedForeground: "mutedForeground",
	accent: "accentSurface",
	accentForeground: "accentSurfaceForeground",
	tertiary: "chrome",
	tertiaryActive: "toolbarControlHover",
	destructive: "error",
	destructiveForeground: "errorForeground",
	warning: "warning",
	warningForeground: "canvas",
	border: "border",
	input: "input",
	ring: "focus",
	sidebar: "sidebar",
	sidebarForeground: "sidebarForeground",
	sidebarPrimary: "accent",
	sidebarPrimaryForeground: "accentForeground",
	sidebarAccent: "sidebarRowActive",
	sidebarAccentForeground: "sidebarForeground",
	sidebarBorder: "sidebarBorder",
	sidebarRing: "focus",
	chart1: "accent",
	highlightMatch: "searchMatchBackground",
	highlightActive: "searchMatchActiveBackground",
	highlight: "accent",
	highlightForeground: "accentForeground",
};

const TERMINAL_FROM_T3: Partial<Record<keyof TerminalColors, string>> = {
	background: "terminalBackground",
	foreground: "terminalForeground",
	cursor: "terminalCursor",
	cursorAccent: "terminalBackground",
	selectionBackground: "terminalSelection",
};

function pickColors(
	colors: Record<string, string>,
	mapping: Record<string, string | undefined>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(mapping).flatMap(([key, t3Key]) => {
			const value = t3Key ? colors[t3Key] : undefined;
			return value ? [[key, value]] : [];
		}),
	);
}

/**
 * Converts a T3 Code skin (t3skins.dev skin.json) into the theme config shape
 * the importer reads. Returns null when the entry is not a T3 skin.
 */
export function fromT3Skin(entry: unknown): Record<string, unknown> | null {
	const parsed = t3SkinSchema.safeParse(entry);
	if (!parsed.success) return null;

	const { id, name, appearance, colors, css } = parsed.data;
	return {
		id,
		name,
		type: appearance,
		ui: pickColors(colors, UI_FROM_T3),
		terminal: pickColors(colors, TERMINAL_FROM_T3),
		css,
	};
}
