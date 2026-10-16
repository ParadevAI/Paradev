import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import type { Instance as TippyInstance } from "tippy.js";

interface SuggestionList {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** Keys go to a suggestion list only while it is on screen; Escape closes it. */
export function suggestionKeyDown(
	popup: TippyInstance | undefined,
	list: SuggestionList | null | undefined,
	props: SuggestionKeyDownProps,
): boolean {
	if (!popup?.state.isVisible) return false;
	if (props.event.key === "Escape") {
		props.event.preventDefault();
		props.event.stopPropagation();
		popup.hide();
		return true;
	}
	return list?.onKeyDown(props) ?? false;
}
