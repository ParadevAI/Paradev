import type { MermaidOptions } from "streamdown";

export type MermaidRenderConfig = NonNullable<MermaidOptions["config"]>;

export type MermaidAppearance = "light" | "dark";

/** The app colours a diagram is drawn with, in any CSS colour syntax. */
export type MermaidThemeColors = {
	background: string;
	foreground: string;
	card: string;
	muted: string;
	mutedForeground: string;
	border: string;
};

export type MermaidTheme = {
	appearance: MermaidAppearance;
	colors?: Partial<MermaidThemeColors>;
	fontFamily?: string;
};

/** Turns Mermaid source into SVG markup, or rejects with the parse error. */
export type MermaidRenderer = (
	source: string,
	config: MermaidRenderConfig,
) => Promise<string>;

export type MermaidDiagramState =
	| { status: "idle" }
	| { status: "rendering" }
	| { status: "ready"; svg: string }
	| { status: "error"; error: string };
