import { isLargePaste, normalizePastedText } from "@superset/chat/core";
import {
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	COMMAND_PRIORITY_LOW,
	COMMAND_PRIORITY_NORMAL,
	HISTORIC_TAG,
	HISTORY_PUSH_TAG,
	type LexicalEditor,
	PASTE_COMMAND,
	REDO_COMMAND,
	UNDO_COMMAND,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	createPasteUndo,
	type PastedTextEntry,
	type PasteUndoResult,
} from "../../utils/pasteUndo";

function $editorText(): string {
	return $getRoot().getTextContent();
}

function $charBeforeSelection(): string | undefined {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return undefined;
	const { offset } = selection.anchor;
	const node = selection.anchor.getNode();
	if ($isTextNode(node)) return node.getTextContent()[offset - 1];
	if (offset === 0) return undefined;
	const previous = node.getChildAtIndex?.(offset - 1);
	return previous?.getTextContent().at(-1);
}

function toCards(texts: readonly string[]): PastedTextEntry[] {
	return texts.map((text) => ({ id: crypto.randomUUID(), text }));
}

export function usePastedTexts(
	editor: LexicalEditor,
	{
		enabled,
		onCardsChange,
	}: {
		enabled: boolean;
		onCardsChange: (cards: PastedTextEntry[], editorText: string) => void;
	},
) {
	const [cards, setCardsState] = useState<PastedTextEntry[]>([]);
	const cardsRef = useRef(cards);
	const [history] = useState(createPasteUndo);
	const onCardsChangeRef = useRef(onCardsChange);
	onCardsChangeRef.current = onCardsChange;

	const readText = useCallback(
		() => editor.getEditorState().read($editorText),
		[editor],
	);
	const setCards = useCallback(
		(next: PastedTextEntry[], editorText: string) => {
			cardsRef.current = next;
			setCardsState(next);
			onCardsChangeRef.current(next, editorText);
		},
		[],
	);

	useEffect(() => {
		if (!enabled) return;
		const applyStep = (result: PasteUndoResult | null) => {
			if (!result) return false;
			setCards(result.cards, $editorText());
			// The editor's own history reverts the text half of the step.
			return !result.editorChanged;
		};
		const unregisterPaste = editor.registerCommand<ClipboardEvent>(
			PASTE_COMMAND,
			(event) => {
				if (!(event instanceof ClipboardEvent)) return false;
				const text = normalizePastedText(
					event.clipboardData?.getData("text/plain") ?? "",
				);
				if (!isLargePaste(text)) return false;
				event.preventDefault();
				const editorText = $editorText();
				const added = toCards([text]);
				history.record({
					added,
					removed: [],
					textBefore: editorText,
					textAfter: editorText,
				});
				const after = [...cardsRef.current, ...added];
				setCards(after, editorText);
				return true;
			},
			COMMAND_PRIORITY_NORMAL,
		);
		const unregisterUndo = editor.registerCommand(
			UNDO_COMMAND,
			() => applyStep(history.undo($editorText(), cardsRef.current)),
			COMMAND_PRIORITY_LOW,
		);
		const unregisterRedo = editor.registerCommand(
			REDO_COMMAND,
			() => applyStep(history.redo($editorText(), cardsRef.current)),
			COMMAND_PRIORITY_LOW,
		);
		// A new edit starts a new branch, as in the editor's own history.
		const unregisterEdits = editor.registerUpdateListener(
			({ editorState, prevEditorState, tags }) => {
				if (tags.has(HISTORIC_TAG)) return;
				if (editorState.read($editorText) !== prevEditorState.read($editorText))
					history.clearRedo();
			},
		);
		return () => {
			unregisterPaste();
			unregisterUndo();
			unregisterRedo();
			unregisterEdits();
		};
	}, [editor, enabled, history, setCards]);

	const remove = useCallback(
		(id: string) => {
			const before = cardsRef.current;
			const index = before.findIndex((card) => card.id === id);
			const entry = before[index];
			if (!entry) return;
			const after = before.filter((card) => card.id !== id);
			const editorText = readText();
			history.record({
				added: [],
				removed: [{ entry, index }],
				textBefore: editorText,
				textAfter: editorText,
			});
			setCards(after, editorText);
			editor.focus();
		},
		[editor, history, readText, setCards],
	);

	const showInTextField = useCallback(
		(id: string) => {
			const before = cardsRef.current;
			const index = before.findIndex((entry) => entry.id === id);
			const card = before[index];
			if (!card) return;
			const after = before.filter((entry) => entry.id !== id);
			const textBefore = readText();
			setCards(after, textBefore);
			editor.update(
				() => {
					let selection = $getSelection();
					if (!$isRangeSelection(selection)) {
						$getRoot().selectEnd();
						selection = $getSelection();
					}
					if (!$isRangeSelection(selection)) return;
					const previous = $charBeforeSelection();
					selection.insertRawText(
						previous !== undefined && previous !== "\n"
							? `\n${card.text}`
							: card.text,
					);
				},
				{
					tag: HISTORY_PUSH_TAG,
					onUpdate: () =>
						history.record({
							added: [],
							removed: [{ entry: card, index }],
							textBefore,
							textAfter: readText(),
						}),
				},
			);
			editor.focus();
		},
		[editor, history, readText, setCards],
	);

	// Cards from a stored draft or a returned prompt; not an undoable step.
	const restore = useCallback((texts: readonly string[]) => {
		if (texts.length === 0) return;
		const next = [...cardsRef.current, ...toCards(texts)];
		cardsRef.current = next;
		setCardsState(next);
	}, []);

	const clear = useCallback(() => {
		cardsRef.current = [];
		setCardsState([]);
		history.reset();
	}, [history]);

	return { cards, cardsRef, remove, showInTextField, restore, clear };
}
