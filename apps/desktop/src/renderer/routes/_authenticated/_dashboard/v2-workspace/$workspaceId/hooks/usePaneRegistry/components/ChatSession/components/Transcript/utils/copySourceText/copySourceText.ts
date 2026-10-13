import type { ClipboardEvent } from "react";

const SOURCE_TEXT = "data-source-text";
const BLOCK_TAGS = new Set([
	"DIV",
	"P",
	"PRE",
	"LI",
	"UL",
	"OL",
	"BLOCKQUOTE",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"TABLE",
	"TR",
]);

function fragmentText(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
	if (node instanceof Element && node.tagName === "BR") return "\n";
	let text = "";
	let previousBlock = false;
	for (const child of node.childNodes) {
		const next = fragmentText(child);
		if (!next) continue;
		const block = child instanceof Element && BLOCK_TAGS.has(child.tagName);
		if (
			text &&
			(block || previousBlock) &&
			!text.endsWith("\n") &&
			!next.startsWith("\n")
		) {
			text += "\n";
		}
		text += next;
		previousBlock = block;
	}
	return text;
}

export function copySourceText(event: ClipboardEvent<HTMLElement>) {
	if (event.defaultPrevented) return;
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
	const range = selection.getRangeAt(0);
	const ancestor = range.commonAncestorContainer;
	if (!event.currentTarget.contains(ancestor)) return;

	const element =
		ancestor instanceof Element ? ancestor : ancestor.parentElement;
	const within = element?.closest(`[${SOURCE_TEXT}]`);
	let text = within?.getAttribute(SOURCE_TEXT);
	if (text == null) {
		const copied = range.cloneContents();
		const sources = copied.querySelectorAll(`[${SOURCE_TEXT}]`);
		if (sources.length === 0) return;
		for (const part of sources) {
			part.textContent = part.getAttribute(SOURCE_TEXT);
		}
		text = fragmentText(copied);
	}
	event.clipboardData.setData("text/plain", text);
	event.preventDefault();
}
