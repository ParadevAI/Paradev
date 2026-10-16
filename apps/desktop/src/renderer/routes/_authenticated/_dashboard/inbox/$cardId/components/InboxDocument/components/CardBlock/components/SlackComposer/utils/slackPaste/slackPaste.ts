import { type Editor, isNodeActive } from "@tiptap/core";
import {
	Fragment,
	type MarkType,
	DOMParser as PMDOMParser,
	type Node as ProseMirrorNode,
	Slice,
} from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { linkLabel } from "../linkLabel";
import type { SlackBlockKind } from "../slackBlocks";

function pasteUrl(editor: Editor, url: string, linkType: MarkType) {
	const { state } = editor;
	const link = linkType.create({ href: url });
	editor.view.dispatch(
		state.tr
			.replaceSelectionWith(state.schema.text(linkLabel(url), [link]), false)
			.setStoredMarks([]),
	);
}

function pasteLines(editor: Editor, text: string) {
	text.split(/\r?\n/).forEach((line, i) => {
		if (i > 0) editor.commands.slackNewLine();
		if (line)
			editor.view.dispatch(
				editor.state.tr.replaceSelectionWith(
					editor.state.schema.text(line),
					false,
				),
			);
	});
}

/** A pasted list takes over the caret's line; the text after the caret keeps its own line and format. */
/** The one list a clipboard holds, read without the caret's context reshaping it. */
function clipboardList(editor: Editor, html: string): ProseMirrorNode | null {
	const body = new DOMParser().parseFromString(html, "text/html").body;
	const doc = PMDOMParser.fromSchema(editor.schema).parse(body);
	const list = doc.childCount === 1 ? doc.firstChild : null;
	return list?.type.name === "bulletList" || list?.type.name === "orderedList"
		? list
		: null;
}

function pasteList(editor: Editor, list: ProseMirrorNode) {
	editor.commands.deleteSelection();
	editor.commands.splitBlock();
	editor.commands.setTextSelection(editor.state.selection.from - 2);
	editor.commands.toggleSlackBlock(list.type.name as SlackBlockKind);
	const tr = editor.state.tr.replaceSelection(
		Slice.maxOpen(Fragment.from(list)),
	);
	const after = tr.doc.resolve(tr.selection.$from.after(1));
	editor.view.dispatch(tr.setSelection(TextSelection.near(after, 1)));
}

/** Slack pastes plain text as typed lines with no formatting, and a lone URL as a short link. */
export function handleSlackPaste(
	editor: Editor,
	event: ClipboardEvent,
): boolean {
	const data = event.clipboardData;
	const text = data?.getData("text/plain");
	const { state } = editor;
	if (data?.types.includes("text/html")) {
		const list = clipboardList(editor, data.getData("text/html"));
		if (!list || isNodeActive(state, "codeBlock")) return false;
		if (isNodeActive(state, "listItem"))
			editor.view.dispatch(
				state.tr.replaceSelection(Slice.maxOpen(Fragment.from(list))),
			);
		else pasteList(editor, list);
		return true;
	}
	if (!text) return false;
	const url = text.trim();
	const linkType = state.schema.marks.link;
	if (
		/^https?:\/\/\S+$/.test(url) &&
		linkType &&
		state.selection.$from.parent.type.allowsMarkType(linkType)
	) {
		if (!state.selection.empty) return false;
		pasteUrl(editor, url, linkType);
		return true;
	}
	pasteLines(editor, text);
	return true;
}
