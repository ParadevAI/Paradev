export type PastedTextEntry = { id: string; text: string };

export type PasteStep = {
	added: PastedTextEntry[];
	removed: { entry: PastedTextEntry; index: number }[];
	textBefore: string;
	textAfter: string;
};

export type PasteUndoResult = {
	cards: PastedTextEntry[];
	// The step also changed the editor, so its own history must move too.
	editorChanged: boolean;
};

function without(
	cards: readonly PastedTextEntry[],
	entries: readonly PastedTextEntry[],
): PastedTextEntry[] {
	const ids = new Set(entries.map((entry) => entry.id));
	return cards.filter((card) => !ids.has(card.id));
}

function withRemovedBack(
	cards: readonly PastedTextEntry[],
	removed: PasteStep["removed"],
): PastedTextEntry[] {
	const next = [...cards];
	for (const { entry, index } of [...removed].sort(
		(a, b) => a.index - b.index,
	)) {
		next.splice(Math.min(index, next.length), 0, entry);
	}
	return next;
}

/**
 * Card changes live outside the editor's history. A step applies only while
 * the editor text is what it was right after (undo) or before (redo) it, so
 * card steps and typing undo in the order they happened. Steps hold only the
 * cards they added or removed, so cards restored from a draft or a returned
 * prompt are left alone.
 */
export function createPasteUndo() {
	let undoStack: PasteStep[] = [];
	let redoStack: PasteStep[] = [];
	return {
		record(step: PasteStep) {
			undoStack.push(step);
			redoStack = [];
		},
		undo(
			text: string,
			cards: readonly PastedTextEntry[],
		): PasteUndoResult | null {
			const step = undoStack.at(-1);
			if (!step || step.textAfter !== text) return null;
			undoStack.pop();
			redoStack.push(step);
			return {
				cards: withRemovedBack(without(cards, step.added), step.removed),
				editorChanged: step.textBefore !== step.textAfter,
			};
		},
		redo(
			text: string,
			cards: readonly PastedTextEntry[],
		): PasteUndoResult | null {
			const step = redoStack.at(-1);
			if (!step || step.textBefore !== text) return null;
			redoStack.pop();
			undoStack.push(step);
			const removed = step.removed.map(({ entry }) => entry);
			return {
				cards: [...without(cards, removed), ...step.added],
				editorChanged: step.textBefore !== step.textAfter,
			};
		},
		clearRedo() {
			redoStack = [];
		},
		reset() {
			undoStack = [];
			redoStack = [];
		},
	};
}
