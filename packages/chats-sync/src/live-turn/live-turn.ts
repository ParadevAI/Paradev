import type {
	SessionUpdate,
	ToolCallContent,
	ToolKind,
} from "@agentclientprotocol/sdk";

type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ToolBlock {
	kind: "tool";
	id: string;
	title: string;
	toolKind: ToolKind;
	status: ToolStatus;
	input: unknown;
	/** The tool's text output; empty until it finishes (or when it printed nothing). */
	output: string;
	/** Who a `dev ask <id|name>` command asks, as written; `askedDevId` resolves it to the Dev. */
	ask: string | null;
	/** Milliseconds into the turn when the call started and ended; only stored traces have them. */
	startedAt?: number;
	endedAt?: number;
	/** The helpers a `subagent` call started, in order; absent on any other tool. */
	subagents?: SubagentRun[];
	/** The tool's name (`sketch`, `bash`, …) when the runner says it, so a client can draw a tool its own way. */
	name?: string;
}

/** What one subagent used, as the runner counts it (packages/runner/src/subagents). */
export interface SubagentUsage {
	/** Model calls. */
	steps: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	/** In dollars, as pi prices the model. */
	cost: number;
}

/** One helper a Dev started with the `subagent` tool: its type, its task, what it did, and how it ended. */
export interface SubagentRun {
	id: string;
	/** researcher, planner, writer or reviewer. */
	agent: string;
	task: string;
	status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
	usage: SubagentUsage | null;
	model: string | null;
	error: string | null;
	/** Its place in a chain, from 1; null when it ran alone or in parallel. */
	step: number | null;
	/** Its own text, thinking and tool calls, as a turn's. */
	blocks: TurnBlock[];
	/** Milliseconds into the turn when it started and ended; only stored traces have them. */
	startedAt?: number;
	endedAt?: number;
}

/** Why and how a chat's session was closed for a fresh one (`_meta["dev/rollover"]`, packages/runner/src/rollover). */
interface RolloverInfo {
	reason: string;
	/** Context tokens when it closed; null when unknown. */
	tokens: number | null;
	contextWindow: number;
	/** Whether the old session wrote a handover note for the new one. */
	handover: boolean;
}

/** pi compacting the session's context, or, with `rollover`, the chat's session closed for a fresh one. */
export interface CompactionBlock {
	kind: "compaction";
	id: string;
	status: string;
	rollover: RolloverInfo | null;
}

type TurnBlock =
	| { kind: "text"; text: string }
	| { kind: "thought"; text: string }
	| ToolBlock
	| CompactionBlock;

/** What a watcher has seen of one turn: its blocks in the order they streamed. */
export interface TurnStream {
	/**
	 * Whether the stream has reached this turn's start. A box replays its session's recent history on load, earlier
	 * turns included; everything before this turn's prompt belongs to them.
	 */
	inTurn: boolean;
	blocks: TurnBlock[];
}

/** Whether a tool call is still going (not yet completed or failed). */
export const toolRunning = (tool: ToolBlock) =>
	tool.status === "pending" || tool.status === "in_progress";

/** How long a tool call took, in ms; null unless a stored trace stamped both its start and its end. */
export const toolDuration = (tool: ToolBlock) =>
	tool.startedAt !== undefined && tool.endedAt !== undefined
		? tool.endedAt - tool.startedAt
		: null;

export const EMPTY_STREAM: TurnStream = { inTurn: false, blocks: [] };

/** `_meta` key the runner stamps on a turn's prompt chunk (packages/runner/src/hub). */
const TURN_ID_META = "dev/turnId";
/** `_meta` key the runner puts on a rollover's `compaction_update`. */
const ROLLOVER_META = "dev/rollover";
/** `_meta` key on a stored trace's tool updates: milliseconds into the turn (packages/runner/src/turn-trace). */
const AT_META = "dev/at";

function stampedAt(update: {
	_meta?: { [key: string]: unknown } | null;
}): number | undefined {
	const at = update._meta?.[AT_META];
	return typeof at === "number" ? at : undefined;
}

/** `_meta` key on a tool call: the tool's name (packages/runner/src/pi/event-map). */
const TOOL_META = "dev/tool";

function toolName(
	meta: { [key: string]: unknown } | null | undefined,
): string | undefined {
	const name = meta?.[TOOL_META];
	return typeof name === "string" ? name : undefined;
}

const named = (name: string | undefined) => (name ? { name } : {});

/** `_meta` key on a `subagent` call's update carrying one run's state. */
const RUN_META = "dev/subagentRun";
/** `_meta` key on a run's own updates: the `subagent` call and the run they belong to. */
const NESTED_META = "dev/subagent";

const RUN_STATUSES = new Set<SubagentRun["status"]>([
	"pending",
	"in_progress",
	"completed",
	"failed",
	"cancelled",
]);

function nestedIn(
	meta: { [key: string]: unknown } | null | undefined,
): { parent: string; run: string } | null {
	const n = meta?.[NESTED_META] as
		| { parent?: unknown; run?: unknown }
		| undefined;
	return n && typeof n.parent === "string" && typeof n.run === "string"
		? { parent: n.parent, run: n.run }
		: null;
}

const num = (v: unknown) =>
	typeof v === "number" && Number.isFinite(v) ? v : 0;

function runInfo(
	meta: { [key: string]: unknown } | null | undefined,
): Omit<SubagentRun, "blocks" | "startedAt" | "endedAt"> | null {
	const r = meta?.[RUN_META] as Record<string, unknown> | undefined;
	if (!r || typeof r !== "object" || typeof r.id !== "string") return null;
	const u = r.usage as Record<string, unknown> | undefined;
	return {
		id: r.id,
		agent: String(r.agent ?? ""),
		task: String(r.task ?? ""),
		status: RUN_STATUSES.has(r.status as SubagentRun["status"])
			? (r.status as SubagentRun["status"])
			: "pending",
		usage:
			u && typeof u === "object"
				? {
						steps: num(u.steps),
						input: num(u.input),
						output: num(u.output),
						cacheRead: num(u.cacheRead),
						cacheWrite: num(u.cacheWrite),
						cost: num(u.cost),
					}
				: null,
		model: typeof r.model === "string" ? r.model : null,
		error: typeof r.error === "string" ? r.error : null,
		step: typeof r.step === "number" ? r.step : null,
	};
}

/** Adds or updates a run, keeping what it did so far, and stamps when it started and ended (stored traces only). */
function upsertRun(
	runs: SubagentRun[],
	info: NonNullable<ReturnType<typeof runInfo>>,
	at: number | undefined,
): SubagentRun[] {
	const existing = runs.find((r) => r.id === info.id);
	const startedAt =
		existing?.startedAt ?? (info.status !== "pending" ? at : undefined);
	const ended =
		info.status === "completed" ||
		info.status === "failed" ||
		info.status === "cancelled";
	const endedAt = existing?.endedAt ?? (ended ? at : undefined);
	const run: SubagentRun = {
		...info,
		blocks: existing?.blocks ?? [],
		...when(startedAt, endedAt),
	};
	return existing
		? runs.map((r) => (r.id === info.id ? run : r))
		: [...runs, run];
}

/** Whether a subagent run is still going. */
export const runActive = (run: SubagentRun) =>
	run.status === "pending" || run.status === "in_progress";

function rolloverInfo(
	meta: { [key: string]: unknown } | null | undefined,
): RolloverInfo | null {
	const r = meta?.[ROLLOVER_META] as Partial<RolloverInfo> | undefined;
	if (!r || typeof r !== "object") return null;
	return {
		reason: String(r.reason ?? ""),
		tokens: typeof r.tokens === "number" ? r.tokens : null,
		contextWindow: Number(r.contextWindow ?? 0),
		handover: r.handover === true,
	};
}

const ROLLOVER_REASONS: Record<string, string> = {
	context: "the context was getting full",
	compactions: "it had been compacted too often",
	overflow: "the context overflowed",
};

const kTokens = (n: number) =>
	n >= 1_000_000
		? `${+(n / 1_000_000).toFixed(1)}M`
		: `${Math.round(n / 1000)}k`;

/** How a compaction or rollover reads in a turn: a short title and, for a rollover, why and what carried over. */
export function compactionText(block: CompactionBlock): {
	title: string;
	detail: string | null;
} {
	if (block.rollover) {
		const { reason, tokens, contextWindow, handover } = block.rollover;
		const why = ROLLOVER_REASONS[reason] ?? reason;
		const size =
			tokens !== null && contextWindow
				? ` (${kTokens(tokens)} of ${kTokens(contextWindow)} tokens)`
				: "";
		return {
			title: "New session started",
			detail: `${why[0]!.toUpperCase()}${why.slice(1)}${size}. ${handover ? "A handover note was written." : "No handover note."}`,
		};
	}
	const title: Record<string, string> = {
		in_progress: "Compacting context…",
		failed: "Context compaction failed",
		cancelled: "Context compaction stopped",
	};
	return { title: title[block.status] ?? "Context compacted", detail: null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASK = /(?:^|[\s;&|(])dev\s+ask\s+(?:"([^"]+)"|'([^']+)'|([^\s"';&|)]+))/;

/** Who a bash call running `dev ask <id|name> …` asks (an id, or a name, quoted or not), else null. */
export function askTarget(input: unknown): string | null {
	const command = (input as { command?: unknown } | null)?.command;
	if (typeof command !== "string") return null;
	const match = ASK.exec(command);
	return match ? (match[1] ?? match[2] ?? match[3]!).trim() || null : null;
}

/**
 * The Dev an ask target means, by the server's rule (roster `findDev`): an id, or a name only one of the chat's
 * Devs has (case-insensitive). An ambiguous or unknown name is null: the server refused that ask too.
 */
export function askedDevId(
	target: string,
	devs: { id: string; name: string }[],
): string | null {
	if (UUID.test(target)) return target.toLowerCase();
	const named = devs.filter(
		(m) => m.name.toLowerCase() === target.toLowerCase(),
	);
	return named.length === 1 ? named[0]!.id : null;
}

function contentText(
	content: ToolCallContent[] | null | undefined,
): string | null {
	if (!content) return null;
	return content
		.flatMap((c) =>
			c.type === "content" && c.content.type === "text" ? [c.content.text] : [],
		)
		.join("\n");
}

/** Streamed text arrives a few characters at a time: extend the last block when it's the same kind. */
function appendText(
	blocks: TurnBlock[],
	kind: "text" | "thought",
	text: string,
): TurnBlock[] {
	const last = blocks.at(-1);
	if (last?.kind === kind)
		return [...blocks.slice(0, -1), { kind, text: last.text + text }];
	return [...blocks, { kind, text }];
}

function upsertTool(
	blocks: TurnBlock[],
	id: string,
	change: (tool: ToolBlock | null) => ToolBlock,
): TurnBlock[] {
	const index = blocks.findIndex((b) => b.kind === "tool" && b.id === id);
	if (index < 0) return [...blocks, change(null)];
	return blocks.map((b, i) => (i === index ? change(b as ToolBlock) : b));
}

const when = (startedAt: number | undefined, endedAt?: number) => ({
	...(startedAt !== undefined ? { startedAt } : {}),
	...(endedAt !== undefined ? { endedAt } : {}),
});

/** Applies one ACP `session/update` to what's been seen of the turn `turnId`. Pure; unknown updates change nothing. */
export function applySessionUpdate(
	stream: TurnStream,
	turnId: string,
	update: SessionUpdate,
): TurnStream {
	if (update.sessionUpdate === "user_message_chunk") {
		// A prompt starts a turn: this one (start over, e.g. after a reconnect's replay) or an earlier one (skip it).
		return { inTurn: update._meta?.[TURN_ID_META] === turnId, blocks: [] };
	}
	if (!stream.inTurn) return stream;
	const nested = nestedIn(update._meta);
	const blocks = nested
		? stream.blocks.map((b) =>
				b.kind === "tool" && b.id === nested.parent && b.subagents
					? {
							...b,
							subagents: b.subagents.map((run) =>
								run.id === nested.run
									? { ...run, blocks: applyToBlocks(run.blocks, update) }
									: run,
							),
						}
					: b,
			)
		: applyToBlocks(stream.blocks, update);
	return blocks === stream.blocks ? stream : { ...stream, blocks };
}

/** A `subagent` call heard of only through its runs (a watcher who joined after it started). */
const subagentTool = (id: string): ToolBlock => ({
	kind: "tool",
	id,
	title: "subagent",
	toolKind: "other",
	status: "in_progress",
	input: null,
	output: "",
	ask: null,
	subagents: [],
});

/** Keeps a tool's subagent runs when an update rebuilds it. */
const runsOf = (tool: ToolBlock | null) =>
	tool?.subagents ? { subagents: tool.subagents } : {};

/** Applies one update to a list of blocks: the turn's own, or one subagent run's. */
function applyToBlocks(
	blocks: TurnBlock[],
	update: SessionUpdate,
): TurnBlock[] {
	switch (update.sessionUpdate) {
		case "agent_message_chunk":
		case "agent_thought_chunk": {
			if (update.content.type !== "text" || !update.content.text) return blocks;
			return appendText(
				blocks,
				update.sessionUpdate === "agent_message_chunk" ? "text" : "thought",
				update.content.text,
			);
		}
		case "tool_call":
			return upsertTool(blocks, update.toolCallId, (existing) => ({
				kind: "tool",
				id: update.toolCallId,
				title: update.title,
				toolKind: update.kind ?? "other",
				status: update.status ?? "pending",
				input: update.rawInput ?? null,
				output: contentText(update.content) ?? existing?.output ?? "",
				ask: askTarget(update.rawInput),
				...when(stampedAt(update)),
				...runsOf(existing),
				...named(toolName(update._meta) ?? existing?.name),
			}));
		case "tool_call_update": {
			const run = runInfo(update._meta);
			if (run) {
				return upsertTool(blocks, update.toolCallId, (existing) => ({
					...(existing ?? subagentTool(update.toolCallId)),
					subagents: upsertRun(
						existing?.subagents ?? [],
						run,
						stampedAt(update),
					),
				}));
			}
			return upsertTool(blocks, update.toolCallId, (existing) => {
				const input = update.rawInput ?? existing?.input ?? null;
				const status = update.status ?? existing?.status ?? "pending";
				return {
					kind: "tool",
					id: update.toolCallId,
					title: update.title ?? existing?.title ?? "Tool",
					toolKind: update.kind ?? existing?.toolKind ?? "other",
					status,
					input,
					output: contentText(update.content) ?? existing?.output ?? "",
					ask: askTarget(input),
					...when(
						existing?.startedAt,
						status === "completed" || status === "failed"
							? stampedAt(update)
							: undefined,
					),
					...runsOf(existing),
					...named(existing?.name),
				};
			});
		}
		case "compaction_update": {
			const id = update.compactionId;
			const index = blocks.findIndex(
				(b) => b.kind === "compaction" && b.id === id,
			);
			const existing = index >= 0 ? (blocks[index] as CompactionBlock) : null;
			const block: CompactionBlock = {
				kind: "compaction",
				id,
				status: update.status,
				rollover: rolloverInfo(update._meta) ?? existing?.rollover ?? null,
			};
			return index >= 0
				? blocks.map((b, i) => (i === index ? block : b))
				: [...blocks, block];
		}
		default:
			return blocks;
	}
}
