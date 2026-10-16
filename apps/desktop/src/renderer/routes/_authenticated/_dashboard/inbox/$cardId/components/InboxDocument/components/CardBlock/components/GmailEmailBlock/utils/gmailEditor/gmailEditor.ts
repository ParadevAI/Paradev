import { type AnyExtension, type Editor, Extension } from "@tiptap/core";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";

/** Gmail's four sizes, as the CSS it writes; Normal carries none. */
export const FONT_SIZES = {
	small: "x-small",
	normal: null,
	large: "large",
	huge: "xx-large",
} as const;
export type FontSizeName = keyof typeof FONT_SIZES;

/** The first rows of Gmail's text color palette. */
export const TEXT_COLORS = [
	"#000000",
	"#444444",
	"#666666",
	"#999999",
	"#cccccc",
	"#eeeeee",
	"#f3f3f3",
	"#ffffff",
	"#ff0000",
	"#ff9900",
	"#ffff00",
	"#00ff00",
	"#00ffff",
	"#4a86e8",
	"#0000ff",
	"#9900ff",
	"#ff00ff",
	"#e6b8af",
	"#f4cccc",
	"#fce5cd",
	"#fff2cc",
	"#d9ead3",
	"#d0e0e3",
	"#c9daf8",
	"#cfe2f3",
	"#d9d2e9",
	"#ead1dc",
] as const;

const SIZE_STEPS = Object.values(FONT_SIZES);

/** Gmail's ⌘⇧+ and ⌘⇧-: one size up or down, Small to Huge. */
function stepSize(editor: Editor, by: 1 | -1): boolean {
	const current =
		(editor.getAttributes("textStyle").fontSize as string | undefined) ?? null;
	const next =
		SIZE_STEPS[
			Math.min(
				SIZE_STEPS.length - 1,
				Math.max(0, SIZE_STEPS.indexOf(current as never) + by),
			)
		] ?? null;
	const chain = editor.chain().focus();
	(next ? chain.setFontSize(next) : chain.unsetFontSize()).run();
	return true;
}

const INDENT_PX = 40;
const INDENT_MAX = 8;

/** A plain line indents by Gmail's 40px steps; a list item nests instead. */
const paragraphIndent = Extension.create({
	name: "gmailParagraphIndent",
	addGlobalAttributes() {
		return [
			{
				types: ["paragraph"],
				attributes: {
					indent: {
						default: 0,
						parseHTML: (element) =>
							Math.min(
								INDENT_MAX,
								Math.round(
									(Number.parseInt(element.style.marginLeft, 10) || 0) /
										INDENT_PX,
								),
							),
						renderHTML: (attributes) =>
							attributes.indent
								? { style: `margin-left: ${attributes.indent * INDENT_PX}px` }
								: {},
					},
				},
			},
		];
	},
});

/** Gmail's Indent more and Indent less: nests a list item, or moves a plain line in or out. */
export function gmailIndent(editor: Editor, by: 1 | -1): boolean {
	if (editor.isActive("listItem")) {
		if (by > 0) editor.commands.sinkListItem("listItem");
		else editor.commands.liftListItem("listItem");
		return true;
	}
	const { state } = editor;
	const { from, to } = state.selection;
	const tr = state.tr;
	state.doc.nodesBetween(from, to, (node, pos) => {
		if (node.type.name !== "paragraph") return;
		const indent = Math.max(
			0,
			Math.min(INDENT_MAX, (node.attrs.indent ?? 0) + by),
		);
		tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
	});
	if (tr.docChanged) editor.view.dispatch(tr);
	return true;
}

/** Backspace at the start of a first list item: Gmail joins it to the line above, or keeps it at the top. */
function backspaceAtListStart(editor: Editor): boolean {
	const { selection } = editor.state;
	const { $from, empty } = selection;
	if (!empty || $from.parentOffset > 0 || $from.depth < 3) return false;
	const item = $from.node(-1);
	if (item.type.name !== "listItem" || $from.index(-1) > 0) return false;
	if ($from.index(-2) > 0) return false;
	const listStart = $from.before(-2);
	if (listStart === 0) return true;
	return editor.chain().liftListItem("listItem").joinBackward().run();
}

/** Gmail's composer keys beyond the editor's own (⌘B, ⌘I, ⌘U, ⌘Z). */
function gmailShortcuts(onLink: () => void) {
	return Extension.create({
		name: "gmailShortcuts",
		priority: 1000,
		addKeyboardShortcuts() {
			return {
				"Mod-Shift-7": () => this.editor.commands.toggleOrderedList(),
				"Mod-Shift-8": () => this.editor.commands.toggleBulletList(),
				"Mod-Shift-9": () => this.editor.commands.toggleBlockquote(),
				"Mod-Shift-x": () => this.editor.commands.toggleStrike(),
				"Mod-y": () => this.editor.commands.redo(),
				"Mod-+": () => stepSize(this.editor, 1),
				"Mod-_": () => stepSize(this.editor, -1),
				"Mod-]": () => gmailIndent(this.editor, 1),
				"Mod-[": () => gmailIndent(this.editor, -1),
				Backspace: () => backspaceAtListStart(this.editor),
				"Mod-\\": () =>
					this.editor.chain().focus().unsetAllMarks().clearNodes().run(),
				"Mod-k": () => {
					onLink();
					return true;
				},
			};
		},
	});
}

/** Gmail types what you type: no markdown shortcuts, no links while typing, no menus. */
export const GMAIL_EDITOR_FEATURES = {
	slashCommand: false,
	fileMention: false,
	bubbleMenu: false,
	trailingNode: false,
	markdownPaste: false,
	inputRules: false,
	autolink: false,
} as const;

/** What a Gmail composer adds to the shared editor: sizes, colors and Gmail's keys. */
export function gmailEditorExtensions(onLink: () => void): AnyExtension[] {
	return [TextStyle, Color, FontSize, paragraphIndent, gmailShortcuts(onLink)];
}
