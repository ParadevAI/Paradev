import type { UserContent, UserMessage } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_SCROLLER_GUTTER_CLASSNAME,
} from "../../constants";
import { UserMessageRow } from "../Transcript/components/UserMessageRow";

const NOTHING = () => {};
const DELIVERING = { failed: false, onRetry: NOTHING, onDiscard: NOTHING };

export function PendingPromptsView({
	prompts,
}: {
	prompts: readonly UserContent[][];
}) {
	const items = useMemo(
		() =>
			prompts.map(
				(content, index): UserMessage => ({
					id: `pending-prompt-${index}`,
					kind: "user_message",
					startedAtMs: 0,
					content,
				}),
			),
		[prompts],
	);
	return (
		<div
			className={cn(
				"min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]",
				CHAT_SCROLLER_GUTTER_CLASSNAME,
			)}
		>
			<div className={cn(CHAT_COLUMN_CLASSNAME, "flex flex-col pt-4 pb-8")}>
				{items.map((item) => (
					<div className="px-4 pb-1" key={item.id}>
						<UserMessageRow
							harness={undefined}
							item={item}
							pending={DELIVERING}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
