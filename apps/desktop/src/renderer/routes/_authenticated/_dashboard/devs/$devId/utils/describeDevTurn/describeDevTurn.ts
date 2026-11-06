import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RouterOutputs } from "@superset/trpc";

export type DevTurn = RouterOutputs["agent"]["activity"]["turns"][number];

/** One line for what a Dev's turn was: who it answered, where. */
export function describeDevTurn(
	turn: DevTurn,
	who: { currentUserId: string | null; nameOf: (id: string | null) => string },
): MessageDescriptor {
	const channel = turn.channelName;
	if (turn.channelKind === "dm") return msg({ message: "Replied to your DM" });
	if (turn.reason === "routine") {
		return msg({ message: `Ran an automation in #${channel}` });
	}
	if (turn.reason === "task_start" || turn.reason === "task_update") {
		return msg({ message: `Worked on a task in #${channel}` });
	}
	if (turn.actingUserId === who.currentUserId) {
		return turn.reason === "mention"
			? msg({ message: `Answered you in #${channel}` })
			: msg({ message: `Followed up with you in #${channel}` });
	}
	const name = who.nameOf(turn.actingUserId);
	return turn.reason === "mention"
		? msg({ message: `Answered ${name} in #${channel}` })
		: msg({ message: `Followed up with ${name} in #${channel}` });
}
