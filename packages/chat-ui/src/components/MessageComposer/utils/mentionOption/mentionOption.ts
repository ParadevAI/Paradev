import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { MessageMentionEntry } from "../../types";

export class MessageMentionOption extends MenuOption {
	entry: MessageMentionEntry;
	constructor(entry: MessageMentionEntry) {
		super(entry.id);
		this.entry = entry;
	}
}
