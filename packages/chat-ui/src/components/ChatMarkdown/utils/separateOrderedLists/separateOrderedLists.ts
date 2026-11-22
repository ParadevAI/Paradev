const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ORDERED_ITEM = /^ {0,3}(\d{1,9})[.)][ \t]+\S/;
const HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const OTHER_BLOCK =
	/^(?: {0,3}(?:[-*+][ \t]|\d{1,9}[.)](?:[ \t]|$)|>|\|)| {4}|\t)/;

/**
 * CommonMark lets only a list that starts at 1 interrupt a paragraph, so an
 * agent's "**Follow-ups**\n4. ..." renders as one run-on paragraph.
 */
export function separateOrderedLists(markdown: string): string {
	const lines = markdown.split("\n");
	const out: string[] = [];
	let fence: { char: string; length: number } | null = null;
	let inParagraph = false;
	let blockStart = true;

	for (const line of lines) {
		const fenceMatch = FENCE.exec(line);
		if (fence) {
			const marker = fenceMatch?.[1];
			if (
				marker?.[0] === fence.char &&
				marker.length >= fence.length &&
				fenceMatch?.[2]?.trim() === ""
			) {
				fence = null;
				blockStart = true;
			}
			out.push(line);
			continue;
		}
		if (fenceMatch) {
			const marker = fenceMatch[1] as string;
			if (!(marker[0] === "`" && fenceMatch[2]?.includes("`"))) {
				fence = { char: marker[0] as string, length: marker.length };
				inParagraph = false;
				out.push(line);
				continue;
			}
		}

		if (line.trim() === "" || HEADING.test(line)) {
			inParagraph = false;
			blockStart = true;
			out.push(line);
			continue;
		}

		const item = ORDERED_ITEM.exec(line);
		if (inParagraph && item && Number(item[1]) !== 1) {
			out.push("");
			inParagraph = false;
		} else if (OTHER_BLOCK.test(line)) {
			if (blockStart || !/^[ \t]/.test(line)) inParagraph = false;
		} else if (blockStart) {
			inParagraph = true;
		}
		blockStart = false;
		out.push(line);
	}

	return out.join("\n");
}
