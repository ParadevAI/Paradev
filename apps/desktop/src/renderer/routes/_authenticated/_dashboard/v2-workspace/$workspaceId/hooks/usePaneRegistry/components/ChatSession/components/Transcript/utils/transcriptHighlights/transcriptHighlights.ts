import { textMatches } from "../textMatches";
import type { FindMatch } from "../transcriptFind";

/** Marks the element that renders an item's searchable text; its value is the item id. */
export const FIND_ITEM_ATTRIBUTE = "data-find-item";

const MATCH_HIGHLIGHT = "chat-search-matches";
const CURRENT_HIGHLIGHT = "chat-search-active";
const RANGE_CAP = 1000;
const BLOCK_TAGS = new Set([
	"blockquote",
	"dd",
	"div",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"li",
	"p",
	"pre",
	"table",
	"td",
	"th",
	"tr",
]);

type TextRun = {
	text: string;
	nodes: { node: Text; start: number }[];
	block: Node;
};

export type HighlightPlan = {
	ranges: Range[];
	current: Range | null;
	currentElement: Element | null;
};

export function supportsHighlights(): boolean {
	return (
		typeof CSS !== "undefined" &&
		typeof Highlight !== "undefined" &&
		Boolean(CSS.highlights)
	);
}

function blockOf(element: Element, root: Element): Node {
	for (
		let current: Element | null = element;
		current && current !== root;
		current = current.parentElement
	) {
		if (BLOCK_TAGS.has(current.localName)) return current;
	}
	return root;
}

/** Text nodes joined per block, so a hit can cross inline markup but not a paragraph. */
function textRuns(root: Element): TextRun[] {
	const walker = root.ownerDocument.createTreeWalker(
		root,
		NodeFilter.SHOW_TEXT,
	);
	const runs: TextRun[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeType !== Node.TEXT_NODE) continue;
		const text = node as Text;
		const parent = text.parentElement;
		if (!text.data || !parent) continue;
		if (parent.closest("[hidden], [aria-hidden='true'], [data-find-skip]")) {
			continue;
		}
		const block = blockOf(parent, root);
		let run = runs.at(-1);
		if (!run || run.block !== block) {
			run = { text: "", nodes: [], block };
			runs.push(run);
		}
		run.nodes.push({ node: text, start: run.text.length });
		run.text += text.data;
	}
	return runs;
}

function nodeAt(run: TextRun, offset: number) {
	return run.nodes.findLast((entry) => entry.start <= offset);
}

function rangeIn(run: TextRun, from: number, to: number): Range | null {
	const start = nodeAt(run, from);
	const end = nodeAt(run, to - 1);
	if (!start || !end) return null;
	const range = start.node.ownerDocument.createRange();
	range.setStart(start.node, from - start.start);
	range.setEnd(end.node, to - end.start);
	return range;
}

export function textRanges(root: Element, needle: string): Range[] {
	if (!needle) return [];
	const ranges: Range[] = [];
	for (const run of textRuns(root)) {
		for (const { start, end } of textMatches(run.text, needle)) {
			const range = rangeIn(run, start, end);
			if (range) ranges.push(range);
		}
	}
	return ranges;
}

/**
 * Every hit under `root`, and the one the find bar points at: the current
 * match's occurrence within its item, clamped when the rendered text has fewer
 * hits than the data did.
 */
export function collectHighlights(
	root: Element,
	needle: string,
	current: FindMatch | null,
): HighlightPlan {
	const ranges: Range[] = [];
	const currentRanges: Range[] = [];
	let currentElement: Element | null = null;
	for (const element of root.querySelectorAll(`[${FIND_ITEM_ATTRIBUTE}]`)) {
		const found = textRanges(element, needle);
		if (ranges.length < RANGE_CAP) {
			ranges.push(...found.slice(0, RANGE_CAP - ranges.length));
		}
		if (
			current &&
			element.getAttribute(FIND_ITEM_ATTRIBUTE) === current.itemId
		) {
			currentElement ??= element;
			currentRanges.push(...found);
		}
	}
	const currentRange =
		current && currentRanges.length > 0
			? (currentRanges[
					Math.min(current.occurrence, currentRanges.length - 1)
				] ?? null)
			: null;
	return { ranges, current: currentRange, currentElement };
}

export function paintHighlights(plan: HighlightPlan): void {
	if (!supportsHighlights()) return;
	CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(...plan.ranges));
	if (plan.current) {
		CSS.highlights.set(CURRENT_HIGHLIGHT, new Highlight(plan.current));
	} else {
		CSS.highlights.delete(CURRENT_HIGHLIGHT);
	}
}

export function clearHighlights(): void {
	if (!supportsHighlights()) return;
	CSS.highlights.delete(MATCH_HIGHLIGHT);
	CSS.highlights.delete(CURRENT_HIGHLIGHT);
}
