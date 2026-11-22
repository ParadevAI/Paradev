import { useHotkey } from "renderer/hotkeys";
import { useUndoStack } from "renderer/stores/undo-stack";

function editsText(event: KeyboardEvent): boolean {
	const target = event.target;
	if (!(target instanceof HTMLElement)) return false;
	if (target.classList.contains("xterm-helper-textarea")) {
		return !event.metaKey;
	}
	return (
		target.isContentEditable ||
		target.closest("input, textarea, select") !== null
	);
}

export function UndoMount() {
	const canUndo = useUndoStack((state) => state.entries.length > 0);
	useHotkey("UNDO", () => useUndoStack.getState().undoLatest(), {
		enabled: canUndo,
		ignoreEventWhen: editsText,
	});
	return null;
}
