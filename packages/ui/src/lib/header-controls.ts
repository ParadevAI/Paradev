import { cn } from "./utils";

/** A tab in a header row: the open tab is a card with a thin ring, the others are muted text with a hover fill. */
export function headerTabClassName(isActive: boolean): string {
	return cn(
		"flex h-7 items-center rounded-md text-xs transition-colors",
		isActive
			? "bg-card text-foreground ring-1 ring-input"
			: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
	);
}

/** The close button at the end of a header tab. */
export const HEADER_TAB_CLOSE_CLASS =
	"flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-[color,background-color,opacity] hover:bg-fill-hover hover:text-foreground";

/** A square icon button in a header row: back and forward, panel toggles, new tab. */
export const HEADER_ICON_BUTTON_CLASS =
	"flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

/** Stroke for the line icons in header rows. */
export const HEADER_ICON_STROKE_WIDTH = 1.75;
