import { useLingui } from "@lingui/react/macro";
import { subagentItem } from "@superset/chat/core";
import { isKnownItem, type UserContent } from "@superset/chat/protocol";
import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import { ScrollToBottomButton } from "@superset/chat-ui/ScrollToBottomButton";
import { cn } from "@superset/ui/utils";
import { useEffect } from "react";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_SCROLLER_GUTTER_CLASSNAME,
} from "../../constants";
import { omittedDescendantIds } from "../../utils/omittedDescendantIds";
import { ChildItemsList } from "../Transcript/components/ChildItemsList";
import { ToolContentList } from "../Transcript/components/ToolContentList";
import { UserMessageRow } from "../Transcript/components/UserMessageRow";
import { useNestedItems } from "../Transcript/providers/NestedItemsProvider";

const RESUME_FOLLOW_PX = 24;

const QUEUED_PENDING = {
	failed: false,
	onRetry: () => {},
	onDiscard: () => {},
};

export function SubagentView({
	itemId,
	queued = [],
}: {
	itemId: string;
	queued?: readonly { id: string; content: UserContent[] }[];
}) {
	const { t } = useLingui();
	const { snapshot, childrenByParent, requestItemBodies } = useNestedItems();
	const item = subagentItem(snapshot.items, itemId);
	const running = item?.status === "running";
	const briefedByParent = (childrenByParent.get(itemId) ?? []).some(
		(child) =>
			isKnownItem(child) &&
			child.kind === "user_message" &&
			child.from === "parent",
	);

	useEffect(() => {
		requestItemBodies(omittedDescendantIds(itemId, childrenByParent));
	}, [itemId, childrenByParent, requestItemBodies]);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<MessageScroller.Provider
				autoScroll
				defaultScrollPosition="end"
				scrollEdgeThreshold={RESUME_FOLLOW_PX}
				scrollPreviousItemPeek={0}
			>
				<MessageScroller.Root className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<MessageScroller.Viewport
						aria-label={t({ message: "Messages" })}
						className={cn(
							"min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]",
							CHAT_SCROLLER_GUTTER_CLASSNAME,
						)}
					>
						<MessageScroller.Content
							className={cn(
								CHAT_COLUMN_CLASSNAME,
								"flex select-text flex-col gap-2 pt-4 pb-8",
							)}
						>
							{item && item.content.length > 0 && !briefedByParent && (
								<div className="text-foreground/60">
									<ToolContentList
										itemId={item.id}
										items={item.content}
										streaming={running}
									/>
								</div>
							)}
							<ChildItemsList flat parentId={itemId} />
							{queued.map((entry) => (
								<UserMessageRow
									harness={snapshot.session?.harness}
									item={{
										id: entry.id,
										kind: "user_message",
										startedAtMs: 0,
										content: entry.content,
									}}
									key={entry.id}
									pending={QUEUED_PENDING}
									sender={t({ message: "Queued" })}
								/>
							))}
						</MessageScroller.Content>
					</MessageScroller.Viewport>
					<div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
						<ScrollToBottomButton />
					</div>
				</MessageScroller.Root>
			</MessageScroller.Provider>
		</div>
	);
}
