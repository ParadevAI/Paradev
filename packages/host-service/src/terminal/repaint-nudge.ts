/**
 * Temporary PTY size for a repaint nudge. One column and one row larger
 * than the live size, so restoring the original size shrinks the width.
 *
 * cursor-agent renders with Ink. Ink writes a frame on resize only when
 * the width shrinks, or when the output string itself changes. A row-only
 * nudge leaves the width alone, so Ink skips the write and the pane stays
 * on the stale frame until a later window resize shrinks the width.
 */
export function repaintNudgeIntermediateSize(
	cols: number,
	rows: number,
): { cols: number; rows: number } {
	return { cols: cols + 1, rows: rows + 1 };
}
