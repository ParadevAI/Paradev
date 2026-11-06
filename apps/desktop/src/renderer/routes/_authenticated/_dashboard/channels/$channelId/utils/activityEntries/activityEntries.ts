import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ChannelAgentState } from "../../hooks/useChannelAgents";
import type { AgentEvent } from "../../stores/channelActivityStore";

export type ActivityEntry =
	| {
			kind: "agent";
			id: string;
			at: number;
			workspaceId: string;
			name: string;
			event: AgentEvent["kind"];
			prNumber?: number;
	  }
	| {
			kind: "note";
			id: string;
			at: number;
			messageId: string;
			authorId: string | null;
			who: string;
			text: string;
			replies: number;
	  }
	| {
			kind: "membership";
			id: string;
			at: number;
			text: string;
	  };

/** The dot colour an agent event takes: the state it moved into. */
export function eventState(event: AgentEvent["kind"]): ChannelAgentState {
	switch (event) {
		case "working":
			return "working";
		case "waiting":
			return "waiting";
		case "review":
		case "pr":
			return "review";
		case "done":
		case "merged":
			return "done";
		default:
			return "idle";
	}
}

/** One line for what an agent did. */
export function eventLine(entry: {
	name: string;
	event: AgentEvent["kind"];
	prNumber?: number;
}): MessageDescriptor {
	const name = entry.name;
	const number = entry.prNumber ?? 0;
	switch (entry.event) {
		case "joined":
			return msg({ message: `${name} joined` });
		case "working":
			return msg({ message: `${name} started working` });
		case "waiting":
			return msg({ message: `${name} needs you` });
		case "review":
			return msg({ message: `${name} finished` });
		case "done":
			return msg({ message: `${name} is done` });
		case "idle":
			return msg({ message: `${name} went idle` });
		case "pr":
			return msg({ message: `${name} opened #${number}` });
		case "merged":
			return msg({ message: `${name} merged #${number}` });
	}
}

/** Newest first, agent events and posts interleaved by time. */
export function sortEntries(entries: ActivityEntry[]): ActivityEntry[] {
	return [...entries].sort((a, b) => b.at - a.at);
}

/** How many entries landed after the timeline was last opened. */
export function countNew(entries: readonly { at: number }[], seenAt: number) {
	return entries.filter((entry) => entry.at > seenAt).length;
}
