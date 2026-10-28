import { emptySnapshot } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { ComposerDropZone } from "@superset/chat-ui/ComposerDropZone";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import {
	Composer,
	type ComposerHandle,
} from "../../../../../ChatSession/components/Composer";
import { ConnectionNotice } from "../../../../../ChatSession/components/ConnectionNotice";
import {
	WorkDrawer,
	type WorkDrawerHandle,
} from "../../../../../ChatSession/components/WorkDrawer";
import { heldPromptQueue } from "../../../../../ChatSession/utils/heldPromptQueue";

const NO_COMMANDS: never[] = [];
const NO_TASKS: never[] = [];
const EMPTY_SNAPSHOT = emptySnapshot();
const IGNORE = () => {};

export function DraftChat({
	draftKey,
	isActive,
	notice,
	onOpenHistory,
	onQueue,
	queued,
	workspaceId,
}: {
	draftKey: string;
	isActive: boolean;
	notice: ReactNode;
	onOpenHistory?: () => void;
	onQueue: (content: UserContent[]) => void;
	queued: UserContent[][];
	workspaceId: string;
}) {
	const promptQueue = useMemo(() => heldPromptQueue(queued), [queued]);
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
			<div className="min-h-0 flex-1" />
			<ConnectionNotice>{notice}</ConnectionNotice>
			<WorkDrawer
				onAppendToComposer={(text) => composerRef.current?.appendText(text)}
				onExit={(exit) => composerRef.current?.returnFocus(exit === "history")}
				onMoveToBackground={IGNORE}
				onOpenSubagent={IGNORE}
				onStop={IGNORE}
				paneRef={paneRef}
				queue={promptQueue}
				ref={drawerRef}
				snapshot={EMPTY_SNAPSHOT}
				tasks={NO_TASKS}
			/>
			<Composer
				availableCommands={NO_COMMANDS}
				canQueue={promptQueue !== undefined}
				draftKey={draftKey}
				inputRef={composerRef}
				isActive={isActive}
				onEnterDrawer={enterDrawer}
				onOpenHistory={onOpenHistory}
				onSend={(content) => onQueue(content)}
				workspaceId={workspaceId}
			/>
		</ComposerDropZone>
	);
}
