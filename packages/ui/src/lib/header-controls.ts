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

/** The rounded container around a tab bar's tabs. A lone tab keeps its pill but gets no fill. */
export function tabCapsuleClassName(tabCount: number): string {
	return cn(
		"flex h-[34px] min-w-0 items-center rounded-full p-[3px] transition-colors",
		tabCount > 1 && "bg-[var(--tab-capsule)]",
	);
}

/** The box one capsule tab takes: tabs share the bar equally, from 120px up to 240px. */
export const CAPSULE_TAB_SLOT_CLASS =
	"relative flex h-7 w-60 min-w-[120px] shrink";

/** A tab inside a capsule: the open tab is a raised pill, the others are muted text with a hover fill. */
export function capsuleTabClassName(isActive: boolean): string {
	return cn(
		"flex h-7 w-full min-w-0 items-center rounded-full text-[13px] transition-colors",
		isActive
			? "bg-[var(--tab-selected)] text-foreground shadow-[var(--tab-selected-shadow)]"
			: "text-muted-foreground hover:bg-[var(--tab-hover)] hover:text-foreground",
	);
}

/** The line between two capsule tabs. It hides while either neighbour is hovered. */
export const TAB_DIVIDER_CLASS =
	"pointer-events-none absolute top-2 bottom-2 -left-px w-px bg-foreground/10 [:hover+*>&]:opacity-0 [:hover>&]:opacity-0";

/** The close button at the end of a header tab. */
export const HEADER_TAB_CLOSE_CLASS =
	"flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-[color,background-color,opacity] hover:bg-fill-hover hover:text-foreground";

/** A square icon button in a header row: back and forward, panel toggles, new tab. */
export const HEADER_ICON_BUTTON_CLASS =
	"flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

/** Stroke for the line icons in header rows. */
export const HEADER_ICON_STROKE_WIDTH = 1.75;
