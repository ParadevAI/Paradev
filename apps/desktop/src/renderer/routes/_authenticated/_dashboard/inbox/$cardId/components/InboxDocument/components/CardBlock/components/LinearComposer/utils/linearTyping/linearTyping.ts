import { Extension, InputRule, markInputRule } from "@tiptap/core";

const LISTS = ["listItem", "taskItem"];

/** Linear's typing rules and keys where they differ from the editor's own. Runs ahead of its rules. */
export const LinearTyping = Extension.create({
	name: "linearTyping",
	priority: 1000,
	addKeyboardShortcuts() {
		return {
			Backspace: () => {
				const { selection } = this.editor.state;
				if (!selection.empty || selection.$from.parentOffset !== 0)
					return false;
				const list = LISTS.find((name) => this.editor.isActive(name));
				return list ? this.editor.commands.liftListItem(list) : false;
			},
			"Mod-Shift-s": () => true,
			"Mod-Shift-x": () => this.editor.commands.toggleStrike(),
			"Mod-Shift-7": () => this.editor.commands.toggleTaskList(),
			"Mod-Shift-8": () => this.editor.commands.toggleBulletList(),
			"Mod-Shift-9": () => this.editor.commands.toggleOrderedList(),
			"Mod-Shift-\\": () => {
				const { $from } = this.editor.state.selection;
				if ($from.parent.type.name === "codeBlock") return true;
				if ($from.parent.content.size === 0)
					return this.editor.commands.setNode("codeBlock");
				const below = $from.after(1);
				return this.editor
					.chain()
					.insertContentAt(below, { type: "codeBlock" })
					.setTextSelection(below + 1)
					.run();
			},
		};
	},
	addInputRules() {
		const { strike, link } = this.editor.schema.marks;
		const inParagraph = (
			state: {
				doc: {
					resolve: (pos: number) => { parent: { type: { name: string } } };
				};
			},
			pos: number,
		) => state.doc.resolve(pos).parent.type.name === "paragraph";
		const rules: InputRule[] = [
			new InputRule({
				find: /^```$/,
				handler: ({ state, range, commands }) => {
					if (!inParagraph(state, range.from)) return null;
					commands.deleteRange(range);
					commands.setNode("codeBlock");
				},
			}),
			new InputRule({
				find: /^\[( |x)?\]$/,
				handler: ({ state, range, match, commands }) => {
					if (!inParagraph(state, range.from)) return null;
					if (this.editor.isActive("taskItem")) return null;
					commands.deleteRange(range);
					commands.toggleTaskList();
					if (match[1] === "x")
						commands.updateAttributes("taskItem", { checked: true });
				},
			}),
			// The editor's own rule strikes `~~x~~`; Linear leaves that as typed.
			new InputRule({
				find: /~~[^~\n]+~~$/,
				handler: ({ state, range }) => {
					state.tr.insertText("~", range.to);
				},
			}),
		];
		if (strike)
			rules.push(
				markInputRule({
					find: /(?:^|\s)(~(?!\s)([^~\n]+?)(?<!\s)~)$/,
					type: strike,
				}),
			);
		if (link)
			rules.push(
				new InputRule({
					find: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/,
					handler: ({ state, range, match }) => {
						const [, text = "", href = ""] = match;
						state.tr
							.replaceWith(
								range.from,
								range.to,
								state.schema.text(text, [link.create({ href })]),
							)
							.removeStoredMark(link);
					},
				}),
			);
		return rules;
	},
});
