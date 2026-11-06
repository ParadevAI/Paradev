import type { ChannelAgent } from "../../hooks/useChannelAgents";

export type AgentEventKind =
	| "joined"
	| "working"
	| "waiting"
	| "review"
	| "done"
	| "idle"
	| "pr"
	| "merged";

export interface AgentEvent {
	id: string;
	/** Epoch ms. */
	at: number;
	workspaceId: string;
	name: string;
	kind: AgentEventKind;
	prNumber?: number;
}

export interface ChannelActivity {
	events: AgentEvent[];
	/** What each agent looked like when last recorded, so only changes become events. */
	marks: Record<string, string>;
	/** When the person last opened the timeline; entries after it are new. */
	seenAt: number;
	touchedAt: number;
}

export const EMPTY_ACTIVITY: ChannelActivity = {
	events: [],
	marks: {},
	seenAt: 0,
	touchedAt: 0,
};

export const MAX_EVENTS = 60;

function mark(agent: ChannelAgent): string {
	const pr = agent.workspace.pr;
	return [agent.state, pr?.prNumber ?? "", pr?.state ?? ""].join("|");
}

function eventAt(agent: ChannelAgent, fallback: number): number {
	return agent.workspace.lastAgentEventAt ?? fallback;
}

/**
 * The event an agent's state makes: finished work reads as finished even
 * while it waits to be opened, and going idle is nothing to tell.
 */
function stateEvent(agent: ChannelAgent): AgentEventKind | null {
	if (agent.state === "idle") return null;
	if (agent.state === "waiting" && agent.workspace.agentStatus === "review") {
		return "review";
	}
	return agent.state;
}

/**
 * The events that bring recorded activity up to date with the agents as
 * they are now: an agent seen for the first time joined, a changed state is
 * an event of that state, a new pull request and a merge are their own.
 * Returns the same object when nothing changed.
 */
export function recordAgents(
	activity: ChannelActivity,
	agents: readonly ChannelAgent[],
	now: number,
): ChannelActivity {
	const events: AgentEvent[] = [];
	const marks = { ...activity.marks };
	for (const agent of agents) {
		const { workspace } = agent;
		const current = mark(agent);
		const previous = marks[workspace.id];
		if (previous === current) continue;
		marks[workspace.id] = current;
		const name = workspace.name;
		const push = (kind: AgentEventKind, at: number, prNumber?: number) =>
			events.push({
				id: `${workspace.id}:${kind}:${at}`,
				at,
				workspaceId: workspace.id,
				name,
				kind,
				...(prNumber === undefined ? {} : { prNumber }),
			});
		const stateKind = stateEvent(agent);
		if (previous === undefined) {
			push("joined", workspace.createdAt.getTime());
			if (stateKind) push(stateKind, eventAt(agent, now));
			if (workspace.pr) {
				push("pr", eventAt(agent, now), workspace.pr.prNumber);
				if (workspace.pr.state === "merged") {
					push("merged", workspace.pr.mergedAt ?? now, workspace.pr.prNumber);
				}
			}
			continue;
		}
		const [previousState, previousPr, previousPrState] = previous.split("|");
		if (agent.state !== previousState && stateKind) {
			push(stateKind, eventAt(agent, now));
		}
		const pr = workspace.pr;
		if (pr && String(pr.prNumber) !== previousPr) {
			push("pr", now, pr.prNumber);
		}
		if (pr?.state === "merged" && previousPrState !== "merged") {
			push("merged", pr.mergedAt ?? now, pr.prNumber);
		}
	}
	if (events.length === 0) return activity;
	const known = new Set(activity.events.map((event) => event.id));
	const fresh = events.filter((event) => !known.has(event.id));
	if (fresh.length === 0) return { ...activity, marks };
	return {
		...activity,
		marks,
		events: [...activity.events, ...fresh]
			.sort((a, b) => a.at - b.at)
			.slice(-MAX_EVENTS),
		touchedAt: now,
	};
}
