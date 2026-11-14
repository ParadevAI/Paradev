/** The app is dark-only (`userInterfaceStyle: "dark"`); these follow `global.css`. */
export const COMPOSER_COLORS = {
	card: "#171717",
	border: "#2a2a2a",
	control: "#262626",
	foreground: "#fafafa",
	muted: "#a3a3a3",
	scrim: "rgba(0, 0, 0, 0.45)",
	destructive: "#ef4444",
	strip: "rgba(255, 255, 255, 0.12)",
	stripPressed: "rgba(255, 255, 255, 0.2)",
	keyPressed: "rgba(255, 255, 255, 0.16)",
	divider: "rgba(255, 255, 255, 0.16)",
	tab: "rgba(255, 255, 255, 0.06)",
	tabSelected: "rgba(255, 255, 255, 0.14)",
	tabClose: "rgba(255, 255, 255, 0.38)",
	/** The strip fill over black, for the chevron that tabs scroll beneath. */
	stripOpaque: "#1f1f1f",
} as const;

/** Kept in step with `ComposerQuickKeysActionTint` on iOS. */
export const QUICK_KEYS_ACTION_TINTS = {
	open: "#00bd7d",
	draft: "#a3a3a3",
	queued: "#fd9900",
	merged: "#ad45ff",
	closed: "#e04f4f",
} as const;

/** Kept in step with `ComposerSessionAttention` on iOS. */
export const SESSION_ATTENTION_COLORS = {
	permission: "#ebb308",
	working: "#f59e0a",
	failed: "#f04545",
	review: "#21c55e",
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
	stripRadius: 11,
	stripInset: 4,
	keyHeight: 28,
	keyRadius: 7,
	keyMinWidth: 22,
	keyGlyph: 13,
	dividerHeight: 15,
	tabRadius: 8,
	tabFontSize: 12,
	tabMarkSize: 13,
	tabMaxLabelWidth: 128,
	tabDotSize: 6,
	tabCloseSize: 15,
	tabControlSize: 28,
	tabChevronReveal: 32,
	slashRowHeight: 52,
	/** `ComposerMetrics.maxWidth` on iOS. */
	maxWidth: 720,
} as const;
