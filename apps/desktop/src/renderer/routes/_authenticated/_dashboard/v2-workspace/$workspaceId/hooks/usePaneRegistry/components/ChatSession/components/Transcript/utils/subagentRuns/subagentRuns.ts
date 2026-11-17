import { isSubagentCall, subagentOutcome } from "@superset/chat/core";
import type {
	AgentMessage,
	Item,
	Notice,
	ToolCall,
} from "@superset/chat/protocol";
import { turnChangedFiles } from "../turnChangedFiles";

export type RunPhase =
	| "running"
	| "waiting"
	| "finished"
	| "failed"
	| "stopped";

export type RunContext = {
	childrenByParent: ReadonlyMap<string, readonly Item[]>;
	/** The session's live task ids; null when no live session backs the transcript. */
	liveTaskIds: { has(id: string): boolean } | null;
	turnRunning: (itemId: string) => boolean;
	textOf: (item: Item) => string;
};

export type SubagentRunRow = {
	itemId: string;
	name: string;
	task: string | null;
	prompt: string | null;
	model: string | null;
	phase: RunPhase;
	startedAtMs: number;
	endedAtMs: number | null;
	action: string | null;
	outcome: string | null;
	files: readonly string[];
	nested: readonly SubagentRunRow[];
	canStop: boolean;
	canSteer: boolean;
	canBackground: boolean;
};

export type SubagentRunCard = {
	rows: readonly SubagentRunRow[];
	live: boolean;
	counts: Record<RunPhase, number>;
	startedAtMs: number;
	endedAtMs: number | null;
};

const PREVIEW_MAX_LENGTH = 160;
const LAUNCH_TOOL_NAMES = new Set(["task", "agent"]);

function isLaunchTool(tool: ToolCall): boolean {
	return LAUNCH_TOOL_NAMES.has(tool.toolName.toLowerCase());
}

/** The calls a tool call stands for as subagent runs, or null when it is an ordinary tool call. */
export function subagentLaunches(
	tool: ToolCall,
	children: readonly Item[] | undefined,
): readonly ToolCall[] | null {
	if (isSubagentCall(tool)) return [tool];
	if (children && children.length > 0 && children.every(isSubagentCall))
		return children as readonly ToolCall[];
	if (isLaunchTool(tool) && (children?.length ?? 0) > 0) return [tool];
	return null;
}

export function firstLinePreview(
	text: string | null | undefined,
): string | null {
	const line = text
		?.split(/\r?\n/)
		.filter((candidate) => !candidate.trimStart().startsWith("```"))
		.map((candidate) =>
			candidate
				.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s+)/, "")
				.replace(/\*\*|__|`/g, "")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.find((candidate) => candidate.length > 0);
	if (!line) return null;
	return line.length > PREVIEW_MAX_LENGTH
		? `${line.slice(0, PREVIEW_MAX_LENGTH - 1).trimEnd()}…`
		: line;
}

function saysRunning(item: ToolCall): boolean {
	return item.subagent === true
		? subagentOutcome(item) === "running"
		: item.status === "running";
}

function isLive(item: ToolCall, context: RunContext): boolean {
	if (!saysRunning(item) || !context.liveTaskIds) return false;
	return context.liveTaskIds.has(item.id) || context.turnRunning(item.id);
}

function endPhase(item: ToolCall): Exclude<RunPhase, "running" | "waiting"> {
	if (item.subagent !== true) {
		if (item.status === "failed") return "failed";
		return item.status === "completed" ? "finished" : "stopped";
	}
	const outcome = subagentOutcome(item);
	return outcome === "running" ? "stopped" : outcome;
}

function promptOf(item: ToolCall): string | null {
	const text = item.content.find((content) => content.type === "text");
	if (text?.type === "text" && text.text.trim()) return text.text.trim();
	const prompt = (item.rawInput as { prompt?: unknown } | undefined)?.prompt;
	return typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
}

function nameOf(item: ToolCall, task: string | null): string {
	const description = (item.rawInput as { description?: unknown } | undefined)
		?.description;
	if (item.subagent === true) return item.title || task || "";
	return typeof description === "string" && description
		? description
		: task || item.title;
}

function lastActivityMs(items: readonly Item[]): number | null {
	let latest: number | null = null;
	for (const item of items) {
		const at = item.completedAtMs ?? item.startedAtMs;
		if (latest === null || at > latest) latest = at;
	}
	return latest;
}

function outcomeOf(
	phase: RunPhase,
	own: readonly Item[],
	context: RunContext,
): string | null {
	if (phase !== "finished" && phase !== "failed") return null;
	const lastMessage = own.findLast(
		(item): item is AgentMessage => item.kind === "agent_message",
	);
	const lastReply = lastMessage ? context.textOf(lastMessage) : null;
	if (phase === "finished") return firstLinePreview(lastReply);
	const error = own.findLast(
		(item): item is Notice =>
			item.kind === "notice" && (item as Notice).noticeKind === "error",
	);
	return firstLinePreview(error?.text ?? lastReply);
}

function actionOf(calls: readonly ToolCall[]): string | null {
	const current =
		calls.findLast((call) => call.status === "running") ?? calls.at(-1);
	return current?.title || null;
}

export function subagentRunRow(
	item: ToolCall,
	context: RunContext,
): SubagentRunRow {
	const children = context.childrenByParent.get(item.id) ?? [];
	const nested: SubagentRunRow[] = [];
	const own: Item[] = [];
	for (const child of children) {
		const launches =
			child.kind === "tool_call"
				? subagentLaunches(
						child as ToolCall,
						context.childrenByParent.get(child.id),
					)
				: null;
		if (launches)
			for (const launch of launches)
				nested.push(subagentRunRow(launch, context));
		else own.push(child);
	}
	const calls = own.filter(
		(child): child is ToolCall => child.kind === "tool_call",
	);
	const live = isLive(item, context);
	const ownRunning = calls.some((call) => call.status === "running");
	const waitingOnNested = !ownRunning && nested.some((row) => isRowLive(row));
	const phase: RunPhase = live
		? waitingOnNested
			? "waiting"
			: "running"
		: endPhase(item);
	const prompt = promptOf(item);
	const task = firstLinePreview(prompt);
	const model =
		own.findLast(
			(child): child is AgentMessage =>
				child.kind === "agent_message" &&
				Boolean((child as AgentMessage).model),
		)?.model ?? null;
	const endedAtMs = live
		? null
		: saysRunning(item)
			? lastActivityMs(own)
			: (item.completedAtMs ?? lastActivityMs(own));
	return {
		itemId: item.id,
		name: nameOf(item, task),
		task,
		prompt,
		model,
		phase,
		startedAtMs: item.startedAtMs,
		endedAtMs,
		action: live || phase === "stopped" ? actionOf(calls) : null,
		outcome: outcomeOf(phase, own, context),
		files: turnChangedFiles(calls).map((file) => file.path),
		nested,
		canStop: live && item.canStop === true,
		canSteer: item.canSteer === true,
		canBackground: live && item.canBackground === true,
	};
}

export function isRowLive(row: SubagentRunRow): boolean {
	return row.phase === "running" || row.phase === "waiting";
}

export function liveRunRows(rows: readonly SubagentRunRow[]): SubagentRunRow[] {
	return rows.flatMap((row) => [
		...(isRowLive(row) ? [row] : []),
		...liveRunRows(row.nested),
	]);
}

export function subagentRunCard(
	launches: readonly ToolCall[],
	context: RunContext,
): SubagentRunCard {
	const rows = launches.map((launch) => subagentRunRow(launch, context));
	const counts: Record<RunPhase, number> = {
		running: 0,
		waiting: 0,
		finished: 0,
		failed: 0,
		stopped: 0,
	};
	for (const row of rows) counts[row.phase] += 1;
	const live = liveRunRows(rows).length > 0;
	const ends = rows.map((row) => row.endedAtMs);
	return {
		rows,
		live,
		counts,
		startedAtMs: Math.min(...rows.map((row) => row.startedAtMs)),
		endedAtMs:
			live || ends.some((end) => end === null)
				? null
				: Math.max(...(ends as number[])),
	};
}
