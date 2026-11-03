/** Resolve a pointer position to a zero-based offset in a rendered Pierre
 * line. DOM ranges account for token spans, tabs, proportional font fallbacks
 * and wrapped lines without assuming a fixed character width. */
export function getCharacterOffsetAtPoint(
	lineElement: HTMLElement,
	clientX: number,
	clientY: number,
): number {
	const characters: { offset: number; rect: DOMRect }[] = [];
	const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT);
	let totalOffset = 0;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const length = node.textContent?.length ?? 0;
		for (let index = 0; index < length; index++) {
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + 1);
			characters.push({
				offset: totalOffset + index,
				rect: range.getBoundingClientRect(),
			});
		}
		totalOffset += length;
	}

	let rowTop = Number.NaN;
	let rowDistance = Number.POSITIVE_INFINITY;
	for (const { rect } of characters) {
		const distance = Math.abs(rect.top + rect.height / 2 - clientY);
		if (distance < rowDistance) {
			rowDistance = distance;
			rowTop = rect.top;
		}
	}

	let endOfRow = totalOffset;
	for (const { offset, rect } of characters) {
		if (rect.top !== rowTop) continue;
		if (clientX < rect.left + rect.width / 2) return offset;
		endOfRow = offset + 1;
	}
	return endOfRow;
}
