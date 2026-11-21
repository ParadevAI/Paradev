// Ink apps such as cursor-agent repaint only when the width shrinks, and a
// wider interim frame would wrap in the client, which keeps the live size.
export function repaintNudgeIntermediateSize(
	cols: number,
	rows: number,
	minRows: number,
): { cols: number; rows: number } {
	return {
		cols: cols > 1 ? cols - 1 : cols + 1,
		rows: rows > minRows ? rows - 1 : rows + 1,
	};
}
