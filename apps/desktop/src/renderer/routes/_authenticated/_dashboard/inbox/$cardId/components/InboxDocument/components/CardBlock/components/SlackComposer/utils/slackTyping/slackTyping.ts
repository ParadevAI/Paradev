import {
	Extension,
	InputRule,
	markInputRule,
	wrappingInputRule,
} from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import {
	atomText,
	type SlackBlockKind,
	slackNewLine,
	toggleSlackBlock,
} from "../slackBlocks";
import { handleSlackPaste } from "../slackPaste";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		slackTyping: {
			toggleSlackBlock: (kind: SlackBlockKind) => ReturnType;
			slackNewLine: () => ReturnType;
		};
	}
}

/** Slack's typing shortcuts and keys where they differ from the editor's. Runs ahead of its rules, so `*x*` is bold. */
export const SlackTyping = Extension.create({
	name: "slackTyping",
	priority: 1000,
	addCommands() {
		return { toggleSlackBlock, slackNewLine };
	},
	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					handlePaste: (_view, event) => handleSlackPaste(this.editor, event),
					// Input rules never run inside code, where Slack's ``` leaves the block.
					handleTextInput: (view, from, to, text) => {
						const { $from } = view.state.selection;
						if (
							text !== "`" ||
							$from.parent.type.name !== "codeBlock" ||
							to !== $from.end() ||
							!$from.parent.textContent.endsWith("``")
						)
							return false;
						return this.editor
							.chain()
							.deleteRange({ from: from - 2, to })
							.exitCode()
							.run();
					},
				},
			}),
		];
	},
	addKeyboardShortcuts() {
		return {
			// Undoing the input rule would turn `x` back into backticks; Slack deletes a character.
			Backspace: () => {
				const { selection } = this.editor.state;
				if (
					selection.empty &&
					selection.$from.parentOffset === 0 &&
					this.editor.isActive("listItem")
				)
					return this.editor.commands.liftListItem("listItem");
				if (!selection.empty || !this.editor.can().undoInputRule())
					return false;
				const pos = selection.from;
				if (pos <= selection.$from.start()) return false;
				return this.editor.commands.deleteRange({ from: pos - 1, to: pos });
			},
			"Shift-Enter": () => this.editor.commands.slackNewLine(),
			// Slack outdents nested items only; a top-level item stays in its list.
			"Shift-Tab": () => {
				const { $from } = this.editor.state.selection;
				let items = 0;
				for (let d = $from.depth; d > 0; d--)
					if ($from.node(d).type.name === "listItem") items++;
				if (items > 1) this.editor.commands.liftListItem("listItem");
				return true;
			},
			// Slack's undo leaves the caret at the end of what it restores.
			"Mod-z": () => {
				if (!this.editor.commands.undo()) return false;
				const { to } = this.editor.state.selection;
				return this.editor.commands.setTextSelection(to);
			},
			"Mod-Shift-x": () => this.editor.commands.toggleStrike(),
			"Mod-Shift-7": () => this.editor.commands.toggleSlackBlock("orderedList"),
			"Mod-Shift-8": () => this.editor.commands.toggleSlackBlock("bulletList"),
			"Mod-Shift-9": () => this.editor.commands.toggleSlackBlock("blockquote"),
			"Mod-Shift-c": () => this.editor.commands.toggleCode(),
			"Mod-Alt-Shift-c": () =>
				this.editor.commands.toggleSlackBlock("codeBlock"),
		};
	},
	addInputRules() {
		const { bold, strike, link } = this.editor.schema.marks;
		const { blockquote } = this.editor.schema.nodes;
		const rules: InputRule[] = [
			new InputRule({
				find: /```$/,
				handler: ({ state, range, commands }) => {
					const $from = state.doc.resolve(range.from);
					const end = $from.end();
					if ($from.parentOffset === 0 && range.to === end) {
						commands.deleteRange(range);
						commands.toggleSlackBlock("codeBlock");
						return;
					}
					const after = state.doc.textBetween(range.to, end, "\n", atomText);
					commands.deleteRange({ from: range.from, to: end });
					const below = state.tr.mapping.map($from.after(1));
					commands.insertContentAt(below, {
						type: "codeBlock",
						...(after ? { content: [{ type: "text", text: after }] } : {}),
					});
					commands.setTextSelection(below + 1);
				},
			}),
		];
		if (link)
			rules.push(
				new InputRule({
					find: /(https?:\/\/\S+)\s$/,
					handler: ({ state, range, match }) => {
						const url = match[1] ?? "";
						const end = range.from + url.length;
						if (state.doc.rangeHasMark(range.from, end, link)) return null;
						state.tr
							.addMark(range.from, end, link.create({ href: url }))
							.insert(range.to, state.schema.text(" "));
					},
				}),
			);
		if (bold)
			rules.push(
				markInputRule({
					find: /(?:^|\s)(\*(?!\s)([^*\n]+?)(?<!\s)\*)$/,
					type: bold,
				}),
			);
		if (strike)
			rules.push(
				markInputRule({
					find: /(?:^|\s)(~(?!\s)([^~\n]+?)(?<!\s)~)$/,
					type: strike,
				}),
			);
		if (blockquote)
			rules.push(wrappingInputRule({ find: /^>$/, type: blockquote }));
		return rules;
	},
});
