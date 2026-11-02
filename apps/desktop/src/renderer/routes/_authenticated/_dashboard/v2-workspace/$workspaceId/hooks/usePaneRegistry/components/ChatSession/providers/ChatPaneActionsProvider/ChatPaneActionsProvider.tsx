import type { TurnChanges, TurnUndoResult } from "@superset/chat-runtime";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { LinkAction, ModifierEvent } from "renderer/lib/clickPolicy";
import type { DiffPaneFilter, OpenFile } from "../../../../../../types";

export type OpenPage = (url: string, event: ModifierEvent) => void;

/** Opens the diff pane narrowed to `filter`, at `path` when one is given. */
export type OpenDiff = (filter: DiffPaneFilter, path?: string) => void;

/** Reads what a turn changed from its worktree snapshots, and undoes it. */
export type TurnChangesSource = {
	sessionId: string;
	load(
		turnId: string,
		live: boolean,
		anchorItemIds?: string[],
	): Promise<TurnChanges | null | "unsupported">;
	undo(
		turnId: string,
		paths: string[],
		anchorItemIds?: string[],
	): Promise<TurnUndoResult | "unsupported">;
};

/** `action` overrides the click policy, as a context menu entry does. */
export type OpenLink = (
	href: string,
	event: ModifierEvent & { clientX: number; clientY: number },
	action?: LinkAction,
) => boolean;

export type ChatPaneActions = {
	/** Absent where the chat has no workspace to open files into. */
	openFile?: OpenFile | undefined;
	/** Absent where the chat has no workspace to show diffs in. */
	openDiff?: OpenDiff | undefined;
	turnChanges?: TurnChangesSource | undefined;
	workspaceId?: string | undefined;
	/** Absent where the chat has no workspace to open pages into. */
	openPage?: OpenPage | undefined;
	openLink?: OpenLink | undefined;
	/** Absent where messages can't be edited, such as while the chat resumes. */
	editMessage?: ((itemId: string, text: string) => void) | undefined;
	editableMessageIds?: ReadonlySet<string> | undefined;
};

const ChatPaneActionsContext = createContext<ChatPaneActions>({});

/**
 * What a transcript row can ask the pane around it to do. A diff header opens
 * its file from six components down; threading a prop that far would make
 * every row in between carry it.
 */
export function ChatPaneActionsProvider({
	children,
	openFile,
	openDiff,
	turnChanges,
	workspaceId,
	openPage,
	openLink,
	editMessage,
	editableMessageIds,
}: ChatPaneActions & { children: ReactNode }) {
	const value = useMemo<ChatPaneActions>(
		() => ({
			openFile,
			openDiff,
			turnChanges,
			workspaceId,
			openPage,
			openLink,
			editMessage,
			editableMessageIds,
		}),
		[
			openFile,
			openDiff,
			turnChanges,
			workspaceId,
			openPage,
			openLink,
			editMessage,
			editableMessageIds,
		],
	);
	return (
		<ChatPaneActionsContext.Provider value={value}>
			{children}
		</ChatPaneActionsContext.Provider>
	);
}

export function useChatPaneActions(): ChatPaneActions {
	return useContext(ChatPaneActionsContext);
}
