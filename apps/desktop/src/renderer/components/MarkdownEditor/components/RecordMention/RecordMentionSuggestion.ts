import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { type Editor, ReactRenderer } from "@tiptap/react";
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import type { ComponentType, RefAttributes } from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { matchSuggestion } from "../../utils/matchSuggestion";
import { suggestionKeyDown } from "../../utils/suggestionKeyDown";
import {
	RecordMentionList,
	type RecordMentionListRef,
} from "./components/RecordMentionList";
import type { RecordMentionItem, RecordMentionSearchFn } from "./types";

const recordMentionSuggestionKey = new PluginKey("markdownEditorRecordMention");

function toAttrs(item: RecordMentionItem) {
	switch (item.kind) {
		case "person":
			return { kind: "person", id: item.id, label: item.name };
		case "task":
			return { kind: "task", id: item.id, label: `${item.slug} ${item.title}` };
		case "pull_request":
			return {
				kind: "pull_request",
				id: item.url,
				label: `#${item.number} ${item.title}`,
			};
	}
}

export type RecordMentionListComponent = ComponentType<
	SuggestionProps<RecordMentionItem> & RefAttributes<RecordMentionListRef>
>;

export interface RecordMentionSuggestionOptions {
	searchMentions: RecordMentionSearchFn | null;
	/** Draws the suggestions; the app's own list unless a surface brings one. */
	list: RecordMentionListComponent | null;
}

export const RecordMentionSuggestion =
	Extension.create<RecordMentionSuggestionOptions>({
		name: "recordMentionSuggestion",

		addOptions() {
			return { searchMentions: null, list: null };
		},

		addProseMirrorPlugins() {
			return [
				Suggestion({
					pluginKey: recordMentionSuggestionKey,
					editor: this.editor,
					char: "@",
					findSuggestionMatch: matchSuggestion,
					allowSpaces: false,
					allow: ({ state, range }) => {
						const $pos = state.doc.resolve(range.from);
						if ($pos.parentOffset === 0) return true;
						const before = $pos.parent.textBetween(
							0,
							$pos.parentOffset,
							"\0",
							" ",
						);
						const charBefore = before.slice(-1);
						return charBefore === " " || charBefore === "\n";
					},

					items: async ({ query }): Promise<RecordMentionItem[]> => {
						const search = this.options.searchMentions;
						if (!search) return [];
						try {
							return await search(query);
						} catch (error) {
							console.error("[mention] search failed", error);
							return [];
						}
					},

					command: ({
						editor,
						range,
						props,
					}: {
						editor: Editor;
						range: { from: number; to: number };
						props: RecordMentionItem;
					}) => {
						editor
							.chain()
							.focus()
							.deleteRange(range)
							.insertContentAt(range.from, [
								{ type: "record-mention", attrs: toAttrs(props) },
								{ type: "text", text: " " },
							])
							.run();
					},

					render: () => {
						const list = this.options.list;
						let component: ReactRenderer<
							RecordMentionListRef,
							SuggestionProps<RecordMentionItem>
						> | null = null;
						let popup: TippyInstance[] | null = null;

						return {
							onStart: (props: SuggestionProps<RecordMentionItem>) => {
								component = new ReactRenderer(list ?? RecordMentionList, {
									props,
									editor: props.editor,
								});
								if (!props.clientRect) return;
								const clientRect = props.clientRect;
								popup = tippy("body", {
									getReferenceClientRect: () => clientRect?.() ?? new DOMRect(),
									appendTo: () =>
										props.editor.view.dom.closest("[role=dialog]") ??
										document.body,
									content: component.element,
									showOnCreate: true,
									interactive: true,
									trigger: "manual",
									placement: "bottom-start",
								});
							},
							onUpdate: (props: SuggestionProps<RecordMentionItem>) => {
								component?.updateProps(props);
								if (!props.clientRect) return;
								const getClientRect = props.clientRect;
								popup?.[0]?.setProps({
									getReferenceClientRect: () =>
										getClientRect() ?? new DOMRect(),
								});
							},
							onKeyDown: (props: SuggestionKeyDownProps) =>
								suggestionKeyDown(popup?.[0], component?.ref, props),
							onExit: () => {
								popup?.[0]?.destroy();
								component?.destroy();
							},
						};
					},
				}),
			];
		},
	});
