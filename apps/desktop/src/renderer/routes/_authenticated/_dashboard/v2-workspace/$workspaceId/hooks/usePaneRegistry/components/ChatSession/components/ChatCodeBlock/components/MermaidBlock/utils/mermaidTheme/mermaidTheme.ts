import type { MermaidTheme } from "@superset/chat-ui/MermaidDiagram";
import type { Theme } from "shared/themes";

/** The app theme's colours a diagram is drawn with. */
export function mermaidTheme(theme: Theme): MermaidTheme {
	const { background, foreground, card, muted, mutedForeground, border } =
		theme.ui;
	return {
		appearance: theme.type,
		colors: { background, foreground, card, muted, mutedForeground, border },
	};
}
