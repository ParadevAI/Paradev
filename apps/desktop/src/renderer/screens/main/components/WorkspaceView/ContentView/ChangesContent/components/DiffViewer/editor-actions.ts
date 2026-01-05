import type * as Monaco from "monaco-editor";
import { monaco } from "renderer/contexts/MonacoProvider";

export function registerCopyPathLineAction(
	editor: Monaco.editor.IStandaloneCodeEditor,
	filePath: string,
) {
	editor.addAction({
		id: "copy-path-line",
		label: "Copy Path:Line",
		keybindings: [
			monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC,
		],
		contextMenuGroupId: "9_cutcopypaste",
		contextMenuOrder: 4,
		run: (ed) => {
			const selection = ed.getSelection();
			if (!selection) return;

			const { startLineNumber, endLineNumber } = selection;
			const pathWithLine =
				startLineNumber === endLineNumber
					? `${filePath}:${startLineNumber}`
					: `${filePath}:${startLineNumber}-${endLineNumber}`;

			navigator.clipboard.writeText(pathWithLine);
		},
	});
}

export function registerSaveAction(
	editor: Monaco.editor.IStandaloneCodeEditor,
	onSave: () => void,
) {
	// Using addAction with an ID allows replacing the action on subsequent calls
	editor.addAction({
		id: "save-file",
		label: "Save File",
		keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
		run: onSave,
	});
}
