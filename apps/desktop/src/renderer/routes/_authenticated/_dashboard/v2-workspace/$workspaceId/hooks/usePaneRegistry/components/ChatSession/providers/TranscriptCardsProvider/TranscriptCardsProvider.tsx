import type {
	AgentMessage,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import { createContext, type ReactNode, useContext } from "react";

/**
 * A thing a tool call made, or a reply asks, that the transcript shows as a
 * card under it. `key` is unique within a turn; the same thing twice in a
 * turn shows one card.
 */
export type TranscriptCardRef =
	| {
			kind: "workspace";
			key: string;
			workspaceId: string;
			name: string | null;
			branch: string | null;
	  }
	| {
			kind: "session";
			key: string;
			workspaceId: string;
			sessionId: string;
			/** The agent's label as the CLI printed it, when it did. */
			agent: string | null;
			/** The first line of the prompt the session started with. */
			prompt: string | null;
	  }
	| {
			kind: "pull_request";
			key: string;
			url: string;
			repoFullName: string;
			number: number;
	  }
	| {
			kind: "report";
			key: string;
			workspaceId: string;
			sessionId: string;
			text: string;
	  }
	| {
			kind: "decision";
			key: string;
			messageId: string;
			options: string[];
			/** What each option says past its title, in the same order; null for a bare title. */
			details?: (string | null)[];
			/** The reply up to the list: shown in place of the whole reply, so the options appear once. */
			intro?: string;
	  };

/** Who said a message, as a channel draws it: a name, a face, and a label such as "Agent". */
export interface TranscriptSpeaker {
	name: string;
	avatar: ReactNode;
	badge?: string;
}

export interface TranscriptCards {
	/** What a finished tool call made, read from its output; empty for most. */
	findCards: (tool: ToolCall) => TranscriptCardRef[];
	/**
	 * Whether a tool call's output is worth fetching for cards, judged from
	 * its outline (title only): a reopened chat omits bodies until asked.
	 */
	wantsBody?: (tool: ToolCall) => boolean;
	/** What the newest reply asks, once its turn is over; empty for most. */
	findMessageCards?: (message: AgentMessage) => TranscriptCardRef[];
	/**
	 * Keeps the plumbing out of view: a tool call that earned cards shows
	 * only its cards, and a lone call stays folded in a run instead of
	 * standing as a row of its own.
	 */
	quietTools?: boolean;
	/** Which cards stay in view when the turn's work is folded; the rest fold with it. */
	keepOut?: (card: TranscriptCardRef) => boolean;
	/**
	 * Draws the chat as a channel: every message left-aligned under its
	 * speaker's face and name, a run of one speaker under one header.
	 */
	speakers?: {
		user: TranscriptSpeaker;
		agent: TranscriptSpeaker;
		/** Who sent the prompts `sent` picks out, such as a coordinator steering this agent through the CLI. */
		relay?: TranscriptSpeaker & { sent: (message: UserMessage) => boolean };
	};
	renderCard: (card: TranscriptCardRef, className: string) => ReactNode;
}

const NONE: TranscriptCards = {
	findCards: () => [],
	renderCard: () => null,
};

const TranscriptCardsContext = createContext<TranscriptCards>(NONE);

/**
 * Lets a screen add cards to a chat's transcript for things the agent made,
 * such as the workspaces a channel's coordinator creates. Without a provider
 * the transcript shows none.
 */
export const TranscriptCardsProvider = TranscriptCardsContext.Provider;

export function useTranscriptCards(): TranscriptCards {
	return useContext(TranscriptCardsContext);
}
