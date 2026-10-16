import { Extension, mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { matchSuggestion } from "renderer/components/MarkdownEditor/utils/matchSuggestion";
import type { LinearPersonView } from "../../../../types";
import { LinearMentionList } from "../../components/LinearMentionList";
import { suggestionPopup } from "../suggestionPopup";

const MAX_RESULTS = 8;

/** A person named in a comment: drawn as `@Name`, written to the markdown as `@handle`. */
export const LinearMention = Node.create({
	name: "linearMention",
	group: "inline",
	inline: true,
	atom: true,
	selectable: false,

	addAttributes() {
		return {
			id: { default: null },
			handle: { default: "" },
			name: { default: "" },
		};
	},

	parseHTML() {
		return [
			{
				tag: "span[data-linear-mention]",
				getAttrs: (element) => ({
					id: element.getAttribute("data-linear-mention"),
					handle: element.getAttribute("data-handle"),
					name: (element.textContent ?? "").replace(/^@/, ""),
				}),
			},
		];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-linear-mention": node.attrs.id,
				"data-handle": node.attrs.handle,
				class: "rounded-sm bg-fill-hover px-1 font-medium",
			}),
			`@${node.attrs.name}`,
		];
	},

	renderText({ node }) {
		return `@${node.attrs.handle}`;
	},

	addStorage() {
		return {
			markdown: {
				serialize(
					state: { write: (text: string) => void },
					node: ProseMirrorNode,
				) {
					state.write(`@${node.attrs.handle}`);
				},
				parse: {},
			},
		};
	},
});

/** The @ menu over the people the card says a comment can mention. */
export function linearMentionSuggestion(people: {
	current: readonly LinearPersonView[];
}) {
	return Extension.create({
		name: "linearMentionSuggestion",
		addProseMirrorPlugins() {
			return [
				Suggestion<LinearPersonView>({
					pluginKey: new PluginKey("linearMentionSuggestion"),
					editor: this.editor,
					char: "@",
					findSuggestionMatch: matchSuggestion,
					items: ({ query }) => {
						const needle = query.toLowerCase();
						return people.current
							.filter(
								(person) =>
									person.handle !== "" &&
									(person.name.toLowerCase().includes(needle) ||
										person.handle.toLowerCase().includes(needle)),
							)
							.slice(0, MAX_RESULTS);
					},
					command: ({ editor, range, props }) => {
						editor
							.chain()
							.focus()
							.insertContentAt(range, [
								{
									type: "linearMention",
									attrs: {
										id: props.id,
										handle: props.handle,
										name: props.name,
									},
								},
								{ type: "text", text: " " },
							])
							.run();
					},
					render: suggestionPopup(LinearMentionList),
				}),
			];
		},
	});
}
