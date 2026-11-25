import { normalizeQuote } from "@superset/chat/core";
import { sourceTextOfRange } from "../copySourceText";
import type { Box } from "../selectionToolbarLayout";

const REPLY_ID_ATTRIBUTE = "data-reply-id";

export type ReplySelection = {
	replyId: string;
	text: string;
	/** The selection's last line, where the pointer usually let go. */
	anchor: Box;
};

function replyOf(node: Node | null): Element | null {
	const element =
		node instanceof Element ? node : (node?.parentElement ?? null);
	return element?.closest(`[${REPLY_ID_ATTRIBUTE}]`) ?? null;
}

function lastLine(range: Range): Box {
	const rects = Array.from(range.getClientRects?.() ?? []).filter(
		(rect) => rect.width > 0 || rect.height > 0,
	);
	const { left, top, right, bottom } =
		rects.at(-1) ?? range.getBoundingClientRect();
	return { left, top, right, bottom };
}

/**
 * A selection inside a shadow root, such as a code block's, shows on the
 * document as a caret before its host; the composed range has its real ends.
 */
function selectedRange(selection: Selection): Range | null {
	const range = selection.getRangeAt(0);
	if (!range.collapsed) return range;
	const host = range.startContainer.childNodes[range.startOffset];
	const root = host instanceof Element ? host.shadowRoot : null;
	if (!root || typeof selection.getComposedRanges !== "function") return null;
	const [inner] = selection.getComposedRanges({ shadowRoots: [root] });
	if (!inner || inner.collapsed) return null;
	const live = document.createRange();
	live.setStart(inner.startContainer, inner.startOffset);
	live.setEnd(inner.endContainer, inner.endOffset);
	return live;
}

/** Only a selection that starts and ends in the same reply is a quote. */
export function readReplySelection(
	selection: Selection | null,
	container: Node,
): ReplySelection | null {
	if (!selection || selection.rangeCount === 0) return null;
	const reply = replyOf(selection.anchorNode);
	if (
		!reply ||
		reply !== replyOf(selection.focusNode) ||
		!container.contains(reply)
	)
		return null;
	const replyId = reply.getAttribute(REPLY_ID_ATTRIBUTE);
	const range = selectedRange(selection);
	if (!replyId || !range) return null;
	const text = normalizeQuote(sourceTextOfRange(range) ?? selection.toString());
	return text ? { replyId, text, anchor: lastLine(range) } : null;
}
