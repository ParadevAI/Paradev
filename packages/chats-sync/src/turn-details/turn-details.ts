import type {
	ApiMessageDetails,
	ApiTurnDetails,
} from "../api-types/api-types.ts";
import {
	applySessionUpdate,
	type SubagentRun,
	type SubagentUsage,
	type ToolBlock,
	type TurnStream,
} from "../live-turn/live-turn.ts";
import type { LiveTurn, LiveTurns } from "../live-turns/live-turns.ts";

/** A stored trace holds only its own turn's updates, prompt left out: it starts inside the turn. */
function replay(turn: ApiTurnDetails): TurnStream {
	const start: TurnStream = { inTurn: true, blocks: [] };
	return (turn.trace?.updates ?? []).reduce(
		(stream, update) => applySessionUpdate(stream, turn.id, update),
		start,
	);
}

const toLiveTurn = (turn: ApiTurnDetails): LiveTurn => ({
	devId: turn.devId,
	groupId: turn.groupId,
	turnId: turn.id,
	parentTurnId: turn.parentTurnId,
	phase: "running",
	stream: replay(turn),
	since: 0,
});

/**
 * A message's stored turn in the live view's shape, so both apps show a past turn the way they showed its stream:
 * `turn` is the Dev's, `asks` holds the `dev ask` turns it started, where `nestedTurn` finds them. Null when the
 * message has no turn or its box never reported a trace.
 */
export function tracedTurn(
	details: ApiMessageDetails,
): { turn: LiveTurn; asks: LiveTurns } | null {
	if (!details.turn?.trace) return null;
	return {
		turn: toLiveTurn(details.turn),
		asks: {
			active: [],
			finished: details.asks.filter((a) => a.trace).map(toLiveTurn),
			quiet: [],
		},
	};
}

/** How long a turn ran, from its start to the box's report (or its end), in ms; null when it never started. */
export function turnDuration(
	turn: Pick<ApiTurnDetails, "startedAt" | "settledAt" | "endedAt">,
): number | null {
	const end = turn.settledAt ?? turn.endedAt;
	if (!turn.startedAt || !end) return null;
	return Math.max(0, Date.parse(end) - Date.parse(turn.startedAt));
}

/** "Subagent", "3 subagents in parallel", "2 subagents in a chain": how a `subagent` call reads above its runs. */
export function subagentsLabel(tool: ToolBlock): string {
	const count = tool.subagents?.length ?? 0;
	if (count <= 1) return "Subagent";
	const chain = Array.isArray(
		(tool.input as { chain?: unknown } | null)?.chain,
	);
	return `${count} subagents ${chain ? "in a chain" : "in parallel"}`;
}

/** What several subagent runs used together; null when none reported any. */
export function totalUsage(runs: SubagentRun[]): SubagentUsage | null {
	const reported = runs.flatMap((r) => (r.usage ? [r.usage] : []));
	if (!reported.length) return null;
	return reported.reduce((sum, u) => ({
		steps: sum.steps + u.steps,
		input: sum.input + u.input,
		output: sum.output + u.output,
		cacheRead: sum.cacheRead + u.cacheRead,
		cacheWrite: sum.cacheWrite + u.cacheWrite,
		cost: sum.cost + u.cost,
	}));
}

const tokens = (n: number) =>
	n < 1000
		? `${n}`
		: n < 1_000_000
			? `${+(n / 1000).toFixed(1)}k`
			: `${+(n / 1_000_000).toFixed(1)}M`;

/** "3 steps · 12.4k tokens · $0.0123": what a subagent (or several) used; the cost only when the model has a price. */
export function usageText(usage: SubagentUsage): string {
	const total = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	const parts = [
		`${usage.steps} ${usage.steps === 1 ? "step" : "steps"}`,
		`${tokens(total)} tokens`,
	];
	if (usage.cost > 0)
		parts.push(
			`$${usage.cost < 0.01 ? usage.cost.toFixed(4) : usage.cost.toFixed(2)}`,
		);
	return parts.join(" · ");
}

/** "3 steps · 12.4k tokens · 42 s": a subagent run's usage and how long it took, whichever it has. */
export function runMetaText(run: SubagentRun): string {
	const took =
		run.startedAt !== undefined && run.endedAt !== undefined
			? formatDuration(run.endedAt - run.startedAt)
			: null;
	return [run.usage && run.usage.steps > 0 ? usageText(run.usage) : null, took]
		.filter(Boolean)
		.join(" · ");
}

/** "850 ms", "4.2 s", "2 min 5 s". */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
	const seconds = Math.round(ms / 1000);
	return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
