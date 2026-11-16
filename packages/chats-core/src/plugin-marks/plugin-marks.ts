/** The brand mark files both apps draw connected apps with (from this folder's `marks`). */
export type PluginMarkFile =
	| "autumn"
	| "circleback"
	| "exa"
	| "github"
	| "gmail"
	| "google-calendar"
	| "granola"
	| "linear"
	| "neon"
	| "notion"
	| "posthog"
	| "sentry"
	| "slack"
	| "stripe"
	| "superhuman"
	| "superset"
	| "typefully"
	| "vercel"
	| "ynab";

/** An app's tile: the brand's mark, centred at `size` (a fraction of the tile's side), on the brand's colour. */
export interface PluginMark {
	file: PluginMarkFile;
	background: string;
	size: number;
}

const WHITE = "#FFFFFF";
const MARK = 0.62;

// Keyed by the brand's slug, as Composio's toolkit slugs are once `_` and `-` are gone (see toolkits).
const MARKS: Record<string, PluginMark> = {
	// Autumn's icon is a white square with its glyph cut out, so the tile behind shows through.
	autumn: { file: "autumn", background: "#000000", size: 0.56 },
	circleback: { file: "circleback", background: WHITE, size: MARK },
	exa: { file: "exa", background: WHITE, size: 0.56 },
	github: { file: "github", background: "#24292F", size: MARK },
	gmail: { file: "gmail", background: WHITE, size: MARK },
	"google-calendar": { file: "google-calendar", background: WHITE, size: 0.58 },
	// Granola's mark is its whole app icon.
	granola: { file: "granola", background: "#B2C24B", size: 1 },
	linear: { file: "linear", background: "#5E6AD2", size: MARK },
	neon: { file: "neon", background: "#000000", size: 0.56 },
	notion: { file: "notion", background: WHITE, size: MARK },
	posthog: { file: "posthog", background: WHITE, size: 0.66 },
	sentry: { file: "sentry", background: "#362D59", size: 0.6 },
	slack: { file: "slack", background: WHITE, size: 0.58 },
	stripe: { file: "stripe", background: "#635BFF", size: 0.56 },
	superhuman: { file: "superhuman", background: "#000000", size: 0.6 },
	superset: { file: "superset", background: "#151110", size: 0.7 },
	// Typefully's icon is its quill on a blue gradient (#33B3F6 → #1880F5); the tile takes the middle of it.
	typefully: { file: "typefully", background: "#1A9CF5", size: 0.66 },
	vercel: { file: "vercel", background: "#000000", size: 0.54 },
	ynab: { file: "ynab", background: WHITE, size: 0.68 },
};

/** The mark kept under a slug ("gmail", "google-calendar"), if there is one; `toolkitMark` finds Composio's by it. */
export function markNamed(key: string): PluginMark | undefined {
	return Object.hasOwn(MARKS, key) ? MARKS[key] : undefined;
}
