// Extra unsafeCSS appended to (not replacing) useDiffCodeViewTheme's own,
// shared by the PR Code tab and the v2-workspace DiffPane via
// useDiffCardCodeViewTheme. Files run edge to edge; each header's top border
// is the divider between files.
//
// [data-diff]'s --diffs-light-bg/--diffs-dark-bg override: the shared hook
// sources its background from the *terminal* theme, which doesn't match the
// app's own var(--background). Both are !important, so this wins by appearing
// later in the concatenated string. The CodeView root gets the same fix
// through useDiffCardCodeViewTheme's style, since unsafeCSS can't reach it.
//
// The header height must match DIFF_HEADER_HEIGHT, which CodeView lays items
// out with.
//
// A function because the additions/deletions colors are theme-branched in
// JS: a `.dark` selector can't reach in from outside the shadow root.
export const DIFF_HEADER_HEIGHT = 32;

export function diffCardUnsafeCss(
	additionsColor: string,
	deletionsColor: string,
): string {
	return `
	[data-diffs-header='default'] {
		border-top: 1px solid var(--border);
		min-height: ${DIFF_HEADER_HEIGHT}px;
		height: ${DIFF_HEADER_HEIGHT}px;
		/* Pushes [data-metadata] (the +/- count) to the right edge instead of
		 * leaving it flush against the filename. Overrides the shared hook's
		 * flex-start (same selector, appended later so it wins). */
		justify-content: space-between;
		/* Pierre's own padding (0 16px) sits the collapse chevron well right
		 * of the pane header's controls; cut to match. */
		padding-left: 8px;
	}
	/* Pierre renders the full relative path as one plain-text node here;
	 * replaced by our own filename/directory split rendered through
	 * renderHeaderFilenameSuffix, which sits right after this in the DOM so
	 * hiding it (rather than removing/reordering) keeps the same slot order. */
	[data-diffs-header='default'] [data-title] {
		display: none;
	}
	/* Pierre slots the renderHeaderFilenameSuffix output through an unstyled
	 * light-DOM wrapper div; as a flex item it defaults to min-width:auto and
	 * refuses to shrink below the full path's intrinsic width, painting the
	 * directory under the +/− counts in narrow panes. Let it shrink so the
	 * suffix's own min-w-0/truncate chain can ellipsize the directory. */
	[data-diffs-header='default'] slot[name='header-filename-suffix']::slotted(*) {
		min-width: 0;
		overflow: hidden;
	}
	/* Pierre lays [data-metadata] out as the +/- counts first, then the
	 * slotted header actions. Ordering the slotted actions first keeps the
	 * counts at the edge; the actions surface to their left on hover. */
	[data-diffs-header='default'] [data-metadata] slot[name='header-metadata']::slotted(*) {
		order: -1;
	}
	/* Same size, font and colors as the +/− totals in the pane header and
	 * PullRequestRow's diff stats. */
	[data-diffs-header='default'] [data-additions-count],
	[data-diffs-header='default'] [data-deletions-count] {
		font-family: inherit;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	[data-diffs-header='default'] [data-additions-count] {
		color: ${additionsColor};
	}
	[data-diffs-header='default'] [data-deletions-count] {
		color: ${deletionsColor};
	}
	[data-diff] {
		--diffs-light-bg: var(--background) !important;
		--diffs-dark-bg: var(--background) !important;
	}
	/* The shared hook zeroes this strip's inline padding, which leaves
	 * "N unmodified lines" touching the pane edge. Restored (same selector,
	 * later in the concatenated string, so this !important wins). */
	[data-separator^='line-info'] [data-separator-content] {
		padding-inline: 8px !important;
	}
`;
}
