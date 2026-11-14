interface EditorHeightBoundsInput {
	lineHeight: number;
	minLines: number;
	maxLines: number;
	/** Height the editor can take before the composer runs off the top; null until measured. */
	room: number | null;
}

export function editorHeightBounds({
	lineHeight,
	minLines,
	maxLines,
	room,
}: EditorHeightBoundsInput): { minHeight: number; maxHeight: number } {
	const minHeight = lineHeight * minLines;
	const maxHeight = lineHeight * maxLines;
	if (room === null) return { minHeight, maxHeight };
	const fit = Math.max(lineHeight, room);
	return {
		minHeight: Math.min(minHeight, fit),
		maxHeight: Math.min(maxHeight, fit),
	};
}
