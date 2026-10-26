import type { ReactNode, Ref } from "react";
import type { ComposerChip, PromptInputDictation } from "../PromptInput/types";

export type MessageMentionEntry = {
	id: string;
	/** What the chip shows once picked. */
	chip: ComposerChip;
	/** The menu row; the composer only adds the highlight around it. */
	row: ReactNode;
};

export type MessageMentionGroup = {
	id: string;
	title?: ReactNode;
	entries: MessageMentionEntry[];
};

export type MessageComposerSubmitPayload = {
	text: string;
	mentions: ComposerChip[];
	files: File[];
};

export type MessageEmojiSuggestion = {
	/** The shortcode without colons, `white_check_mark`. */
	name: string;
	/** The character the composer inserts. */
	emoji: string;
};

export type MessageComposerHandle = {
	focus(): void;
};

export type MessageComposerProps = {
	ref?: Ref<MessageComposerHandle>;
	placeholder: string;
	/** Groups for the @ menu, already filtered and ordered for `query`. */
	getMentionGroups: (query: string) => MessageMentionGroup[];
	/** Returning `false` keeps the draft in the editor. */
	onSubmit: (payload: MessageComposerSubmitPayload) => boolean | undefined;
	dictation?: PromptInputDictation;
	/** Files from the picker, paste and drag and drop, sent with the message. */
	allowAttachments?: boolean;
	/** Ranked matches for `:query`; without it typing `:` does nothing. */
	getEmojiSuggestions?: (query: string) => MessageEmojiSuggestion[];
	/** Starts the editor with this markdown, for editing a sent message. */
	initialMarkdown?: string;
	/** Present when editing: Escape and Cancel call it, and the footer offers Cancel and Save. */
	onCancel?: () => void;
	autoFocus?: boolean;
	className?: string;
};
