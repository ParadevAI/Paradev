import { ReactRenderer } from "@tiptap/react";
import type {
	SuggestionKeyDownProps,
	SuggestionOptions,
	SuggestionProps,
} from "@tiptap/suggestion";
import type { ComponentType, RefAttributes } from "react";
import { suggestionKeyDown } from "renderer/components/MarkdownEditor/utils/suggestionKeyDown";
import tippy, { type Instance as TippyInstance } from "tippy.js";

interface ListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** Shows a suggestion list under the caret while it has items, and gives it the keys. */
export function suggestionPopup<Item>(
	List: ComponentType<SuggestionProps<Item> & RefAttributes<ListRef>>,
): NonNullable<SuggestionOptions<Item>["render"]> {
	return () => {
		let component: ReactRenderer<ListRef, SuggestionProps<Item>> | null = null;
		let popup: TippyInstance[] | null = null;
		return {
			onStart: (props) => {
				component = new ReactRenderer(List, { props, editor: props.editor });
				if (!props.clientRect) return;
				const clientRect = props.clientRect;
				popup = tippy("body", {
					getReferenceClientRect: () => clientRect() ?? new DOMRect(),
					appendTo: () =>
						props.editor.view.dom.closest("[role=dialog]") ?? document.body,
					content: component.element,
					showOnCreate: props.items.length > 0,
					interactive: true,
					trigger: "manual",
					placement: "bottom-start",
				});
			},
			onUpdate: (props) => {
				component?.updateProps(props);
				if (!props.clientRect) return;
				const clientRect = props.clientRect;
				popup?.[0]?.setProps({
					getReferenceClientRect: () => clientRect() ?? new DOMRect(),
				});
				if (props.items.length > 0) popup?.[0]?.show();
				else popup?.[0]?.hide();
			},
			onKeyDown: (props) =>
				suggestionKeyDown(popup?.[0], component?.ref, props),
			onExit: () => {
				popup?.[0]?.destroy();
				component?.destroy();
			},
		};
	};
}
