/** The app is dark-only (`userInterfaceStyle: "dark"`); these follow `global.css`. */
export const COMPOSER_COLORS = {
	card: "#171717",
	border: "#2a2a2a",
	control: "#262626",
	foreground: "#fafafa",
	muted: "#a3a3a3",
	scrim: "rgba(0, 0, 0, 0.45)",
	destructive: "#ef4444",
} as const;

export const COMPOSER_METRICS = {
	controlSize: 36,
	thumbSize: 64,
	miniThumbSize: 24,
	lineHeight: 22,
	editorLines: 4,
	compactEditorLines: 2,
	maxEditorLines: 10,
	edgeInset: 12,
	gap: 8,
} as const;
