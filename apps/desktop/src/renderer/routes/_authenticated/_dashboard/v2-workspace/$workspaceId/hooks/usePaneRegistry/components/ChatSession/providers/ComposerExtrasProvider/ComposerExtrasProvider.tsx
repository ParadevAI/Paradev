import type {
	ComposerChip,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import { createContext, useContext } from "react";

/**
 * What the screen around a chat adds to its composer: more @ menus, and the
 * hidden lines that tell the agent what the chips from those menus point at.
 */
export interface ComposerExtras {
	mentionProviders: readonly ComposerMentionProvider[];
	contextLine: (chips: readonly ComposerChip[]) => string | null;
	/** Runs once the message is sent, with its text and chips: a channel posts a Dev mention to the Dev. */
	afterSend?: (text: string, chips: readonly ComposerChip[]) => void;
}

const NONE: ComposerExtras = { mentionProviders: [], contextLine: () => null };

const ComposerExtrasContext = createContext<ComposerExtras>(NONE);

/** A channel wraps its coordinator's chat in this to let the person @-mention the channel's agents. */
export const ComposerExtrasProvider = ComposerExtrasContext.Provider;

export function useComposerExtras(): ComposerExtras {
	return useContext(ComposerExtrasContext);
}
