import type { UserContent } from "@superset/chat/protocol";
import { ComposerDropZone } from "@superset/chat-ui/ComposerDropZone";
import { useCallback, useMemo, useRef } from "react";
import {
	Composer,
	type ComposerHandle,
} from "../../../../../ChatSession/components/Composer";
import { PendingPromptsView } from "../../../../../ChatSession/components/PendingPromptsView";
import {
	WorkDrawer,
	type WorkDrawerHandle,
} from "../../../../../ChatSession/components/WorkDrawer";
import { ChatPaneActionsProvider } from "../../../../../ChatSession/providers/ChatPaneActionsProvider";

const NO_COMMANDS: never[] = [];

export function DraftChat({
	draftKey,
	getOpenFilePaths,
	isActive,
	launched,
	onOpenHistory,
	onQueue,
	queued,
	workspaceId,
}: {
	draftKey: string;
	getOpenFilePaths?: () => ReadonlySet<string>;
	isActive: boolean;
	launched?: UserContent[];
	onOpenHistory?: () => void;
	onQueue: (content: UserContent[]) => void;
	queued: UserContent[][];
	workspaceId: string;
}) {
	const prompts = useMemo(
		() => (launched ? [launched, ...queued] : queued),
		[launched, queued],
	);
	const composerRef = useRef<ComposerHandle>(null);
	const drawerRef = useRef<WorkDrawerHandle>(null);
	const paneRef = useRef<HTMLDivElement>(null);
	const enterDrawer = useCallback(
		(options: { actionableOnly: boolean }) =>
			drawerRef.current?.focusLast(options) ?? false,
		[],
	);

	return (
		<ComposerDropZone
			className="flex h-full min-h-0 w-full min-w-0 flex-col"
			ref={paneRef}
		>
			{prompts.length > 0 ? (
				<PendingPromptsView prompts={prompts} />
			) : (
				<div className="min-h-0 flex-1" />
			)}
			<WorkDrawer
				onExit={(exit) => composerRef.current?.returnFocus(exit === "history")}
				paneRef={paneRef}
				ref={drawerRef}
			/>
			<ChatPaneActionsProvider
				getOpenFilePaths={getOpenFilePaths}
				workspaceId={workspaceId}
			>
				<Composer
					availableCommands={NO_COMMANDS}
					draftKey={draftKey}
					inputRef={composerRef}
					isActive={isActive}
					promptPending={prompts.length > 0}
					onEnterDrawer={enterDrawer}
					onOpenHistory={onOpenHistory}
					onSend={(content) => onQueue(content)}
					workspaceId={workspaceId}
				/>
			</ChatPaneActionsProvider>
		</ComposerDropZone>
	);
}
