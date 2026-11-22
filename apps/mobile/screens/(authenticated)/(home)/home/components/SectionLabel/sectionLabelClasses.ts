/**
 * Home's one section-label style, after desktop's sidebar section header
 * (DashboardSidebarSectionHeader), at the iOS minimum of 11 rather than 10.
 */
export const SECTION_LABEL_HIT_SLOP = { top: 6, bottom: 6 };

export const SECTION_LABEL = {
	label:
		"text-muted-foreground font-semibold text-[11px] uppercase tracking-[0.075em]",
	count: "text-muted-foreground text-[11px] tracking-[0.075em] tabular-nums",
	/** Space above a section; the list's first section sits close to the chips. */
	frame: (first: boolean) => (first ? "px-4 pb-0 pt-2" : "px-4 pb-0 pt-5"),
	/** The label row: 32pt to see, 44pt to touch with {@link SECTION_LABEL_HIT_SLOP}. */
	row: "min-h-8",
};
