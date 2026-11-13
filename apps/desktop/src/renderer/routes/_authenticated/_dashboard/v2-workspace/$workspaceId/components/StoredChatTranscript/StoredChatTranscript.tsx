import { Trans } from "@lingui/react/macro";
import type { OutboxEntry, SessionSnapshot } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { useTimeline } from "@superset/chat/react";
import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import { useMemo } from "react";
import { Transcript } from "../../hooks/usePaneRegistry/components/ChatSession/components/Transcript";
import { useChildrenByParent } from "../../hooks/usePaneRegistry/components/ChatSession/components/Transcript/hooks/useChildrenByParent";
import { NestedItemsProvider } from "../../hooks/usePaneRegistry/components/ChatSession/components/Transcript/providers/NestedItemsProvider";
import { isTruncatedStoredChat } from "../../utils/loadStoredChatSnapshot";

const ignore = () => {};
const noOlder = async () => false;

/**
 * A stored chat drawn by the chat pane's own transcript, laid out as the
 * pane lays out its live one, so the live chat takes its place without the
 * rows moving.
 */
export function StoredChatTranscript({
	chatId,
	pending,
	snapshot,
}: {
	chatId: string;
	pending: readonly UserContent[][];
	snapshot: SessionSnapshot;
}) {
	const outbox = useMemo(
		() =>
			pending.map(
				(content, index): OutboxEntry => ({
					commandId: `pending-prompt-${index}`,
					clientId: `pending-prompt-${index}`,
					content,
					state: "queued",
					attempts: 0,
					lastError: null,
				}),
			),
		[pending],
	);
	const timeline = useTimeline(snapshot, { nestChildItems: true });
	const childrenByParent = useChildrenByParent(snapshot);
	const nestedItems = useMemo(
		() => ({
			snapshot,
			childrenByParent,
			requestItemBodies: ignore,
			respondToApproval: ignore,
			openSubagent: ignore,
		}),
		[snapshot, childrenByParent],
	);
	return (
		<MessageScroller.Provider
			autoScroll
			defaultScrollPosition="end"
			scrollEdgeThreshold={24}
			scrollPreviousItemPeek={0}
		>
			{isTruncatedStoredChat(chatId, snapshot) && (
				<p className="shrink-0 px-4 py-1.5 text-center text-muted-foreground text-xs">
					<Trans>
						This chat is long, so only its latest part is shown. All of it opens
						once the workspace starts.
					</Trans>
				</p>
			)}
			<div className="@container relative flex min-h-0 flex-1">
				<NestedItemsProvider value={nestedItems}>
					<Transcript
						approvals={[]}
						groups={timeline}
						hasOlder={false}
						onDiscardPrompt={ignore}
						onLoadOlder={noOlder}
						onRequestItemBodies={ignore}
						onRespond={ignore}
						onRetryPrompt={ignore}
						outbox={outbox}
						sessionId={chatId}
						snapshot={snapshot}
					/>
				</NestedItemsProvider>
			</div>
		</MessageScroller.Provider>
	);
}
