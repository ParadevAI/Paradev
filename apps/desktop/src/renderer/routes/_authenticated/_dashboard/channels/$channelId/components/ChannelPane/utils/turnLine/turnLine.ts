import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { DevTurn } from "../../hooks/useChannelDevs";

type Translate = (descriptor: MessageDescriptor) => string;

/** One line for what a Dev did in the channel, by why its turn started. */
export function turnLine(turn: DevTurn, t: Translate): string {
	const devName = turn.devName;
	switch (turn.reason) {
		case "mention":
			return t(msg({ message: `${devName} answered a mention` }));
		case "thread_reply":
			return t(msg({ message: `${devName} replied in a thread` }));
		case "channel_message":
			return t(msg({ message: `${devName} replied` }));
		case "routine":
			return t(msg({ message: `${devName} ran an automation` }));
		case "task_start":
			return t(msg({ message: `${devName} started a task` }));
		case "task_update":
			return t(msg({ message: `${devName} reported on a task` }));
		default:
			return t(msg({ message: `${devName} took a turn` }));
	}
}
