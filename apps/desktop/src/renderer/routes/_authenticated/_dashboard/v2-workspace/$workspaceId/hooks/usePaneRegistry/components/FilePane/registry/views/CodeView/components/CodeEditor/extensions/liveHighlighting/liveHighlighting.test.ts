import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createZedTheme } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { darkTheme, getEditorTheme } from "shared/themes";
import { toHexAuto } from "shared/themes/utils";
import { liveHighlighting, loadLiveHighlighting } from "./liveHighlighting";

function colorsByText(view: EditorView) {
	const colors = new Map<string, string>();
	for (const span of view.contentDOM.querySelectorAll<HTMLElement>(
		"span[style]",
	)) {
		colors.set(span.textContent?.trim() ?? "", span.style.color.toLowerCase());
	}
	return colors;
}

test("re-colors text typed after the editor opens", async () => {
	const live = await loadLiveHighlighting("src/cart.ts");
	if (!live) throw new Error("Highlights should cover TypeScript");
	const view = new EditorView({
		state: EditorState.create({
			doc: "const total = 1;\n",
			extensions: liveHighlighting(live, createZedTheme(darkTheme)),
		}),
		parent: document.body,
	});
	const syntax = getEditorTheme(darkTheme).syntax;

	expect(colorsByText(view).get("const")).toBe(
		toHexAuto(syntax.keyword).toLowerCase(),
	);

	view.dispatch({
		changes: { from: view.state.doc.length, insert: 'const name = "ada";' },
	});

	expect(colorsByText(view).get('"ada"')).toBe(
		toHexAuto(syntax.string).toLowerCase(),
	);
	view.destroy();
});

test("leaves languages Highlights cannot lex to the Lezer style", async () => {
	expect(await loadLiveHighlighting("notes.unknown-ext")).toBeNull();
});
