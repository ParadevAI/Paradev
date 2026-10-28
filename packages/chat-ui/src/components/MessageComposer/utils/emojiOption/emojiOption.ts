import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { MessageEmojiSuggestion } from "../../types";

export class MessageEmojiOption extends MenuOption {
	suggestion: MessageEmojiSuggestion;
	constructor(suggestion: MessageEmojiSuggestion) {
		super(suggestion.name);
		this.suggestion = suggestion;
	}
}
