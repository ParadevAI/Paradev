import type { ReactNode, Ref } from "react";
import type {
	ComposerChip,
	ComposerMentionProvider,
	PromptInputDictation,
} from "../PromptInput/types";

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
	mentionProviders: ComposerMentionProvider[];
	/** Draws a picked mention in place of the default chip; return null to keep the default. */
	renderChip?: (chip: ComposerChip) => ReactNode;
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
