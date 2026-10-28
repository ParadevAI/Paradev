import type {
	MermaidAppearance,
	MermaidRenderConfig,
	MermaidTheme,
	MermaidThemeColors,
} from "../../types";

const FALLBACK_COLORS: Record<MermaidAppearance, MermaidThemeColors> = {
	dark: {
		background: "#1e1e2e",
		foreground: "#cdd6f4",
		card: "#313244",
		muted: "#45475a",
		mutedForeground: "#6c7086",
		border: "#45475a",
	},
	light: {
		background: "#ffffff",
		foreground: "#1e1e2e",
		card: "#f0f0f4",
		muted: "#e6e9ef",
		mutedForeground: "#888888",
		border: "#d0d0d8",
	},
};

export type NormalizeColor = (value: string) => string | null;

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const PROBE_COLOR = "#010203";

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Mermaid's colour maths reads hex, rgb and hsl; a canvas reads every CSS
 * colour syntax and gives back one of those.
 */
export const normalizeCssColor: NormalizeColor = (value) => {
	if (HEX_COLOR.test(value)) return value;
	if (probe === undefined) {
		probe =
			typeof document === "undefined"
				? null
				: document.createElement("canvas").getContext("2d");
	}
	if (!probe) return null;
	probe.fillStyle = PROBE_COLOR;
	probe.fillStyle = value;
	const normalized = probe.fillStyle;
	return normalized === PROBE_COLOR ? null : normalized;
};

export function mermaidThemeConfig(
	theme: MermaidTheme,
	normalize: NormalizeColor = normalizeCssColor,
): MermaidRenderConfig {
	const colors = { ...FALLBACK_COLORS[theme.appearance] };
	for (const key of Object.keys(colors) as (keyof MermaidThemeColors)[]) {
		const given = theme.colors?.[key];
		const normalized = given ? normalize(given) : null;
		if (normalized) colors[key] = normalized;
	}
	const fontFamily = theme.fontFamily ?? "inherit";
	return {
		theme: "base",
		fontFamily,
		themeVariables: {
			darkMode: theme.appearance === "dark",
			fontFamily,
			background: colors.background,
			primaryColor: colors.card,
			primaryTextColor: colors.foreground,
			primaryBorderColor: colors.border,
			secondaryColor: colors.muted,
			secondaryTextColor: colors.foreground,
			secondaryBorderColor: colors.border,
			tertiaryColor: colors.background,
			tertiaryTextColor: colors.foreground,
			tertiaryBorderColor: colors.border,
			lineColor: colors.mutedForeground,
			textColor: colors.foreground,
			titleColor: colors.foreground,
			mainBkg: colors.card,
			nodeBorder: colors.border,
			nodeTextColor: colors.foreground,
			clusterBkg: colors.muted,
			clusterBorder: colors.border,
			edgeLabelBackground: colors.background,
			noteBkgColor: colors.muted,
			noteTextColor: colors.foreground,
			noteBorderColor: colors.border,
		},
	};
}
