import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { deriveBoardColumn } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

/** Where an agent of a channel stands, in the order the pane lists them. */
export type ChannelAgentState =
	| "waiting"
	| "working"
	| "review"
	| "idle"
	| "done";

export const CHANNEL_AGENT_STATES: ChannelAgentState[] = [
	"waiting",
	"working",
	"review",
	"idle",
	"done",
];

export interface ChannelAgent {
	workspace: AccessibleV2Workspace;
	state: ChannelAgentState;
}

const TAG_MAX_LENGTH = 64;

/** The workspace tag that files a workspace under a channel: its name, as the host stores tags. */
export function channelTag(channelName: string): string {
	return channelName.trim().toLowerCase().slice(0, TAG_MAX_LENGTH);
}

/**
 * Waiting covers what needs the person: a question, a failure, or work that
 * finished and nobody opened yet. Opening the agent clears the last one.
 */
export function deriveChannelAgentState(
	workspace: AccessibleV2Workspace,
): ChannelAgentState {
	switch (deriveBoardColumn(workspace)) {
		case "attention":
		case "finished":
			return "waiting";
		case "working":
			return "working";
		case "review":
			return "review";
		case "merged":
		case "deleted":
			return "done";
		default:
			return "idle";
	}
}

/** The workspaces tagged with the channel, newest agent event first. */
export function selectChannelAgents(
	workspaces: readonly AccessibleV2Workspace[],
	tagsById: ReadonlyMap<string, readonly string[]>,
	channelName: string,
): ChannelAgent[] {
	const tag = channelTag(channelName);
	return workspaces
		.filter((workspace) => tagsById.get(workspace.id)?.includes(tag))
		.map((workspace) => ({
			workspace,
			state: deriveChannelAgentState(workspace),
		}))
		.sort(
			(a, b) =>
				(b.workspace.lastAgentEventAt ?? b.workspace.createdAt.getTime()) -
				(a.workspace.lastAgentEventAt ?? a.workspace.createdAt.getTime()),
		);
}

export interface ChannelAgentCounts {
	waiting: number;
	working: number;
}

/** Per tag, how many tagged workspaces wait on the reader and how many are working. */
export function countChannelAgents(
	workspaces: readonly AccessibleV2Workspace[],
	tagsById: ReadonlyMap<string, readonly string[]>,
): Map<string, ChannelAgentCounts> {
	const counts = new Map<string, ChannelAgentCounts>();
	for (const workspace of workspaces) {
		const tags = tagsById.get(workspace.id);
		if (!tags?.length) continue;
		const state = deriveChannelAgentState(workspace);
		if (state !== "waiting" && state !== "working") continue;
		for (const tag of tags) {
			const entry = counts.get(tag) ?? { waiting: 0, working: 0 };
			entry[state] += 1;
			counts.set(tag, entry);
		}
	}
	return counts;
}
