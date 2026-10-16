import { Plural } from "@lingui/react/macro";
import { useState } from "react";
import {
	type ReactFn,
	SlackMessage,
	type SlackMessageView,
} from "../SlackMessage";

const GROUP_WINDOW_S = 5 * 60;
/** A thread longer than this opens on its latest replies, the rest folded above them. */
const FOLD_AFTER = 12;
const SHOWN_WHEN_FOLDED = 8;

/** Slack folds a message into the one before it when the same person sent both within minutes. */
function followsOn(
	previous: SlackMessageView | undefined,
	message: SlackMessageView,
): boolean {
	return (
		previous !== undefined &&
		!message.broadcast &&
		previous.user.id === message.user.id &&
		Number.parseFloat(message.ts) >= Number.parseFloat(previous.ts) &&
		Number.parseFloat(message.ts) - Number.parseFloat(previous.ts) <
			GROUP_WINDOW_S
	);
}

interface SlackThreadMessagesProps {
	messages: SlackMessageView[];
	now: Date;
	/** Absent where the reader can only read the thread. */
	onReact?: ReactFn;
}

/** A thread as Slack lays it out: the root message, a "N replies" rule, then the replies. */
export function SlackThreadMessages({
	messages,
	now,
	onReact,
}: SlackThreadMessagesProps) {
	const [unfolded, setUnfolded] = useState(false);
	const [root, ...replies] = messages;
	const folded =
		!unfolded && replies.length > FOLD_AFTER
			? replies.length - SHOWN_WHEN_FOLDED
			: 0;
	return (
		<>
			{root && <SlackMessage message={root} now={now} onReact={onReact} />}
			<div className="flex items-center gap-3 px-4 py-1.5 text-[11px] text-muted-foreground">
				<span className="shrink-0">
					<Plural value={replies.length} one="# reply" other="# replies" />
				</span>
				<span className="h-px flex-1 bg-border" />
			</div>
			<div className="flex flex-col pb-2">
				{folded > 0 && (
					<button
						type="button"
						onClick={() => setUnfolded(true)}
						className="mx-4 my-1 flex items-center gap-2 rounded-md px-1 py-1 text-left text-[13px] font-semibold text-blue-500 hover:underline dark:text-sky-400"
					>
						<Plural
							value={folded}
							one="Show # more reply"
							other="Show # more replies"
						/>
					</button>
				)}
				{replies.slice(folded).map((message, index) => (
					<SlackMessage
						key={message.ts}
						message={message}
						compact={
							index > 0 && followsOn(replies[folded + index - 1], message)
						}
						now={now}
						onReact={onReact}
					/>
				))}
			</div>
		</>
	);
}
