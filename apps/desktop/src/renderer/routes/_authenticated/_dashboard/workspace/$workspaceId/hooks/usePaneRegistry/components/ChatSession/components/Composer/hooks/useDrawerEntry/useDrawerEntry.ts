import { type KeyboardEvent, useCallback, useRef } from "react";

const EDITOR_SELECTOR = ".prompt-input-editor";

function caretAtStart(editor: HTMLElement): boolean {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0)
		return editor.textContent === "";
	const range = selection.getRangeAt(0);
	if (!range.collapsed || !editor.contains(range.startContainer)) return false;
	const before = document.createRange();
	before.setStart(editor, 0);
	before.setEnd(range.startContainer, range.startOffset);
	return before.toString() === "";
}

export function useDrawerEntry({
	enterDrawer,
	focusComposer,
	recallHistory,
}: {
	enterDrawer: ((options: { actionableOnly: boolean }) => boolean) | undefined;
	focusComposer: () => void;
	recallHistory: () => void;
}) {
	const savedRef = useRef<{ editor: HTMLElement; range: Range | null } | null>(
		null,
	);

	const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
		if (!enterDrawer || event.defaultPrevented) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.nativeEvent.isComposing) return;
		const editor =
			event.target instanceof HTMLElement
				? event.target.closest<HTMLElement>(EDITOR_SELECTOR)
				: null;
		if (!editor) return;
		const arrowUp =
			event.key === "ArrowUp" && !event.shiftKey && caretAtStart(editor);
		const shiftTab = event.key === "Tab" && event.shiftKey;
		if (!arrowUp && !shiftTab) return;
		const selection = window.getSelection();
		const range =
			selection && selection.rangeCount > 0
				? selection.getRangeAt(0).cloneRange()
				: null;
		if (!enterDrawer({ actionableOnly: shiftTab })) return;
		savedRef.current = { editor, range };
		event.preventDefault();
		event.stopPropagation();
	};

	const returnFocus = useCallback(
		(recall = false) => {
			const saved = savedRef.current;
			savedRef.current = null;
			if (!saved?.editor.isConnected) {
				if (recall) recallHistory();
				else focusComposer();
				return;
			}
			saved.editor.focus();
			if (saved.range && saved.editor.contains(saved.range.startContainer)) {
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(saved.range);
			}
			if (recall) recallHistory();
		},
		[focusComposer, recallHistory],
	);

	return { onKeyDownCapture, returnFocus };
}
