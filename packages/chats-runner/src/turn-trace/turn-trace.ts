import type { SessionUpdate } from "@agentclientprotocol/sdk";

/**
 * What a turn did, kept by the API so its message can show it after the stream is gone: the turn's ACP updates
 * (streamed text merged, the prompt left out), each tool call stamped with when it started and ended.
 */
export interface TurnTrace {
	/** The model the session ran on, e.g. `anthropic/claude-sonnet-5.5`. */
	model: string;
	updates: SessionUpdate[];
	/** Set when the turn did more than a trace keeps: later updates were dropped. */
	truncated?: true;
}

/** `_meta` key on a recorded tool update: milliseconds since the turn started (packages/sync live-turn reads it). */
const AT_META = "dev/at";
/** A tool's input or output, or one stretch of text or thinking, is cut at this many characters. */
export const TRACE_TEXT_MAX = 4_000;
/** The whole trace stays under this (as JSON); the API refuses bigger ones. */
export const TRACE_BYTES_MAX = 200_000;

/** `_meta` key on a subagent run's own updates: the `subagent` call and the run they belong to. */
export const SUBAGENT_META = "dev/subagent";

const runOf = (update: SessionUpdate) =>
	(update._meta?.[SUBAGENT_META] as { run?: string } | undefined)?.run ?? null;

/**
 * Whether two updates come from the same run (the turn itself, or one subagent): streamed text merges only then, so
 * parallel subagents' text never runs into the Dev's or into each other's.
 */
export const sameRun = (a: SessionUpdate, b: SessionUpdate) =>
	runOf(a) === runOf(b);

/** Hides what must never be stored (the box's MCP header values) and cuts long strings. */
function clean(value: unknown, secrets: string[], max: number): unknown {
	if (typeof value === "string") {
		const redacted = secrets.reduce(
			(text, secret) => text.replaceAll(secret, "[redacted]"),
			value,
		);
		return redacted.length > max
			? `${redacted.slice(0, max)}… (${redacted.length - max} more characters)`
			: redacted;
	}
	if (Array.isArray(value)) return value.map((v) => clean(v, secrets, max));
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, clean(v, secrets, max)]),
		);
	return value;
}

/**
 * Collects one turn's trace as it streams. Bounded: long text is cut, and once the trace would pass
 * `TRACE_BYTES_MAX` the rest of the turn is dropped. `rawOutput` goes (its text is already in `content`).
 */
export class TraceRecorder {
	private readonly updates: SessionUpdate[] = [];
	private bytes = 0;
	private truncated = false;
	private readonly now: () => number;
	private readonly startedAt: number;

	constructor(
		private readonly opts: { secrets: string[]; now?: () => number },
	) {
		this.now = opts.now ?? Date.now;
		this.startedAt = this.now();
	}

	add(update: SessionUpdate) {
		if (this.truncated || update.sessionUpdate === "user_message_chunk") return;
		const last = this.updates.at(-1);
		if (
			(update.sessionUpdate === "agent_message_chunk" ||
				update.sessionUpdate === "agent_thought_chunk") &&
			update.content.type === "text" &&
			last?.sessionUpdate === update.sessionUpdate &&
			last.content.type === "text" &&
			sameRun(last, update)
		) {
			if (last.content.text.length >= TRACE_TEXT_MAX) return;
			const text = (last.content.text + update.content.text).slice(
				0,
				TRACE_TEXT_MAX,
			);
			this.bytes += text.length - last.content.text.length;
			this.updates[this.updates.length - 1] = {
				...last,
				content: { type: "text", text },
			};
			return;
		}
		const kept = this.keep(update);
		const size = JSON.stringify(kept).length;
		if (this.bytes + size > TRACE_BYTES_MAX) {
			this.truncated = true;
			return;
		}
		this.bytes += size;
		this.updates.push(kept);
	}

	/** `model`: what answered the turn, known only once it's over (`auto` picks per turn). */
	finish(model: string): TurnTrace {
		// Redacted again whole: a secret can straddle two streamed chunks, which were merged after each was cleaned.
		const updates = clean(
			this.updates,
			this.opts.secrets,
			Infinity,
		) as SessionUpdate[];
		return { model, updates, ...(this.truncated ? { truncated: true } : {}) };
	}

	private keep(update: SessionUpdate): SessionUpdate {
		const at = { [AT_META]: this.now() - this.startedAt };
		if (
			update.sessionUpdate === "tool_call" ||
			update.sessionUpdate === "tool_call_update"
		) {
			const { rawOutput: _output, ...rest } = update;
			return {
				...(clean(rest, this.opts.secrets, TRACE_TEXT_MAX) as typeof rest),
				_meta: { ...update._meta, ...at },
			};
		}
		return clean(update, this.opts.secrets, TRACE_TEXT_MAX) as SessionUpdate;
	}
}
