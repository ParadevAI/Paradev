/**
 * Streaming parsers for the agents' own transcript files — the same
 * source ccusage and T3 Code read, so usage is complete even for turns not
 * driven through Superset.
 *
 * Correctness rules learned from prior art (see
 * plans/20260815-token-spend-twitter-feedback.md):
 * - Claude: count only `type === "assistant"` lines with usage, dedupe on
 *   `message.id + requestId` — the same message is rewritten into multiple
 *   files on resume/fork/compaction, and naive parsers over-count.
 * - Codex: read `payload.info.last_token_usage` (per-turn delta), never
 *   `total_token_usage` (cumulative). Model/cwd ride on `turn_context`
 *   events and carry forward. `input_tokens` is INCLUSIVE of cached tokens.
 * - Reasoning tokens are a subset of output — never added on top.
 */

import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { basename } from "node:path";
import type { UsageAgent } from "../types";
import type { LineParser } from "./line-cache";
import type { LogFile } from "./logs";

export interface UsageLogEntry {
	agent: UsageAgent;
	model: string;
	timestampMs: number;
	cwd: string | null;
	/** Transcript file identity — one file is one CLI session. */
	sessionId: string;
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
	reasoningOutput: number;
	/** Agent-reported real cost in USD (opencode/pi/fx/cursor record one).
	 * When present it replaces the API-list-rate estimate. */
	costUsd?: number;
}

export function sessionIdForFile(path: string): string {
	return basename(path).replace(/\.jsonl$/, "");
}

const SESSION_LABEL_MAX = 80;

/** First real user prompt of a session, trimmed to one short line. Command
 * invocations, caveats, and system-reminder wrappers don't count. */
export function toSessionLabel(text: unknown): string | null {
	if (typeof text !== "string") return null;
	const trimmed = text.trim();
	if (
		!trimmed ||
		trimmed.startsWith("<") ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("Caveat:")
	) {
		return null;
	}
	const line = trimmed.split("\n", 1)[0] ?? "";
	if (!line) return null;
	return line.length > SESSION_LABEL_MAX
		? `${line.slice(0, SESSION_LABEL_MAX - 1)}…`
		: line;
}

/** Longest line handed to a parser. Real transcript lines top out in the
 * single-digit MB (5.8 MB was the largest across 90 days of heavy Claude and
 * Codex use), so anything past this is a corrupt or foreign file, not usage.
 * The bound is what keeps a data file from killing the worker: V8 refuses
 * strings past ~512 MB, and node:readline buffered a newline-free run
 * without limit, throwing `RangeError: Invalid string length` from inside
 * the stream's data callback — unreachable by any try/catch around the
 * iteration, so it took the worker thread down and hung the inline retry. */
export const MAX_LINE_LENGTH = 32 * 1024 * 1024;

interface LineReadResult {
	/** Byte offset just past the last `\n` read. */
	end: number;
	/** An unterminated last line was handed to `onLine`; a later append may
	 * extend it, so resuming from `end` would read it twice. */
	partialTail: boolean;
}

/** Calls `onLine` for each line from byte `start` on, skipping lines past
 * MAX_LINE_LENGTH bytes. Returns null when the file is unreadable. */
export async function readLinesFrom(
	path: string,
	start: number,
	onLine: (line: string) => void,
): Promise<LineReadResult | null> {
	let pending: Buffer[] = [];
	let pendingLength = 0;
	let skipping = false;
	let chunkBase = start;
	let end = start;
	const emit = (raw: Buffer) => {
		const line =
			raw.length > 0 && raw[raw.length - 1] === 0x0d
				? raw.subarray(0, -1)
				: raw;
		if (line.length <= MAX_LINE_LENGTH) onLine(line.toString("utf-8"));
	};
	try {
		const chunks = createReadStream(path, { start }) as AsyncIterable<Buffer>;
		for await (const chunk of chunks) {
			let lineStart = 0;
			for (
				let newline = chunk.indexOf(0x0a);
				newline !== -1;
				newline = chunk.indexOf(0x0a, lineStart)
			) {
				if (skipping) {
					skipping = false;
				} else {
					const piece = chunk.subarray(lineStart, newline);
					emit(pendingLength > 0 ? Buffer.concat([...pending, piece]) : piece);
					pending = [];
					pendingLength = 0;
				}
				lineStart = newline + 1;
				end = chunkBase + lineStart;
			}
			chunkBase += chunk.length;
			if (skipping) continue;
			const rest = chunk.subarray(lineStart);
			pending.push(rest);
			pendingLength += rest.length;
			if (pendingLength > MAX_LINE_LENGTH) {
				pending = [];
				pendingLength = 0;
				skipping = true;
			}
		}
	} catch {
		return null;
	}
	const partialTail = !skipping && pendingLength > 0;
	if (partialTail) emit(Buffer.concat(pending));
	return { end, partialTail };
}

/** Parses a whole-file JSON document, or returns null when the file is
 * missing, malformed, or larger than `maxBytes`. */
export async function readJsonFile(
	path: string,
	maxBytes: number = MAX_LINE_LENGTH,
): Promise<unknown> {
	let file: Awaited<ReturnType<typeof open>> | null = null;
	try {
		file = await open(path, "r");
		if ((await file.stat()).size > maxBytes) return null;
		return JSON.parse(await file.readFile("utf-8"));
	} catch {
		return null;
	} finally {
		await file?.close();
	}
}

/** Longest free-text column (title, summary) read out of an agent's SQLite
 * store; labels are cut to SESSION_LABEL_MAX for display anyway. */
export const MAX_SQL_TEXT_LENGTH = 1024;

export function num(value: unknown): number {
	// Clamp negatives — a corrupt count must not subtract from totals.
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: 0;
}

/** Entry timestamp: parseable and not in the future (26h clock-skew
 * tolerance) wins; otherwise the file's mtime; never NaN. */
export function entryTimestamp(
	raw: string | undefined,
	mtimeMs: number,
): number {
	const parsed = raw ? Date.parse(raw) : Number.NaN;
	if (Number.isFinite(parsed) && parsed <= Date.now() + 26 * 60 * 60 * 1000) {
		return parsed;
	}
	return mtimeMs;
}

interface ClaudeLine {
	type?: string;
	requestId?: string;
	isSidechain?: boolean;
	isMeta?: boolean;
	timestamp?: string;
	cwd?: string;
	message?: {
		id?: string;
		model?: string;
		content?: string | Array<{ type?: string; text?: string }>;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_read_input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_creation?: {
				ephemeral_5m_input_tokens?: number;
				ephemeral_1h_input_tokens?: number;
			};
			output_tokens_details?: { thinking_tokens?: number };
		};
	};
}

export interface ClaudeFileResult {
	/** Last entry per `message.id + requestId`, in first-seen order. */
	byMessage: Record<string, UsageLogEntry>;
	/** Entries without an id, which cannot be deduped. */
	unkeyed: UsageLogEntry[];
	label: string | null;
}

/**
 * Parses `~/.claude/projects/<encoded-cwd>/*.jsonl`. The caller merges each
 * file's `byMessage` into one map so resumed/forked sessions dedupe globally.
 *
 * Dedupe keeps the LAST occurrence per `message.id + requestId`: Claude Code
 * writes one assistant line per content block with a usage snapshot that
 * grows as the response streams, so only the final line carries the request's
 * complete usage (verified token-exact against ccusage; first-wins
 * undercounts output ~10%).
 */
export function claudeFileParser(
	file: LogFile,
	state: ClaudeFileResult = { byMessage: {}, unkeyed: [], label: null },
): LineParser<ClaudeFileResult, ClaudeFileResult> {
	const sessionId = sessionIdForFile(file.path);
	const onLine = (line: string) => {
		const wantLabel = state.label === null;
		if (
			!line.includes('"assistant"') &&
			!(wantLabel && line.includes('"user"'))
		) {
			return;
		}
		let parsed: ClaudeLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (wantLabel && parsed.type === "user" && !parsed.isMeta) {
			const content = parsed.message?.content;
			const text =
				typeof content === "string"
					? content
					: content?.find((block) => block.type === "text")?.text;
			state.label = toSessionLabel(text);
		}
		if (parsed.type !== "assistant") return;
		const usage = parsed.message?.usage;
		const model = parsed.message?.model;
		if (!usage || !model || model === "<synthetic>") return;

		const timestampMs = entryTimestamp(parsed.timestamp, file.mtimeMs);

		const cacheWriteTotal = num(usage.cache_creation_input_tokens);
		const write5m = num(usage.cache_creation?.ephemeral_5m_input_tokens);
		const write1h = num(usage.cache_creation?.ephemeral_1h_input_tokens);
		const entry: UsageLogEntry = {
			agent: "claude",
			model,
			timestampMs,
			cwd: typeof parsed.cwd === "string" ? parsed.cwd : null,
			sessionId,
			// Anthropic's input_tokens excludes cache reads and writes.
			uncachedInput: num(usage.input_tokens),
			cachedInput: num(usage.cache_read_input_tokens),
			// Older logs lack the 5m/1h split; treat the total as 5m writes.
			cacheWrite5m: write5m + write1h > 0 ? write5m : cacheWriteTotal,
			cacheWrite1h: write1h,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.output_tokens_details?.thinking_tokens),
		};

		const dedupeKey = `${parsed.message?.id ?? ""}|${parsed.requestId ?? ""}`;
		if (dedupeKey === "|") {
			state.unkeyed.push(entry);
		} else {
			state.byMessage[dedupeKey] = entry;
		}
	};
	return { state, onLine, result: () => state };
}

interface CodexLine {
	type?: string;
	timestamp?: string;
	payload?: {
		type?: string;
		model?: string;
		cwd?: string;
		message?: string;
		info?: {
			last_token_usage?: {
				input_tokens?: number;
				cached_input_tokens?: number;
				cache_write_input_tokens?: number;
				output_tokens?: number;
				reasoning_output_tokens?: number;
			};
		};
	};
}

export interface SessionFileResult {
	entries: UsageLogEntry[];
	label: string | null;
}

/** The first label found for a session wins. */
export function rememberLabel(
	sessionLabels: Map<string, string> | undefined,
	sessionId: string,
	label: string | null | undefined,
): void {
	if (label && sessionLabels && !sessionLabels.has(sessionId)) {
		sessionLabels.set(sessionId, label);
	}
}

/** Adds one session file's entries inside the window. */
export function appendSessionFile(
	{ entries, label }: SessionFileResult,
	sessionId: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	for (const entry of entries) {
		if (entry.timestampMs >= cutoffMs) out.push(entry);
	}
	rememberLabel(sessionLabels, sessionId, label);
}

export interface CodexFileState extends SessionFileResult {
	currentModel: string | null;
	currentCwd: string | null;
	// Codex occasionally re-emits the same token_count event back-to-back;
	// skipping consecutive identical deltas brings summed deltas within ~1%
	// of the session's own cumulative total_token_usage counter.
	previousDeltaSignature: string | null;
}

/** Parses `$CODEX_HOME/sessions/**\/*.jsonl` rollout files. */
export function codexFileParser(
	file: LogFile,
	state: CodexFileState = {
		entries: [],
		label: null,
		currentModel: null,
		currentCwd: null,
		previousDeltaSignature: null,
	},
): LineParser<SessionFileResult, CodexFileState> {
	const sessionId = sessionIdForFile(file.path);

	const onLine = (line: string) => {
		const wantLabel = state.label === null;
		const isContext =
			line.includes('"turn_context"') || line.includes('"session_meta"');
		if (
			!isContext &&
			!line.includes('"token_count"') &&
			!(wantLabel && line.includes('"user_message"'))
		) {
			return;
		}
		let parsed: CodexLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}

		if (wantLabel && parsed.payload?.type === "user_message") {
			state.label = toSessionLabel(parsed.payload.message);
			return;
		}

		if (parsed.type === "turn_context" || parsed.type === "session_meta") {
			if (typeof parsed.payload?.model === "string") {
				state.currentModel = parsed.payload.model;
			}
			if (typeof parsed.payload?.cwd === "string") {
				state.currentCwd = parsed.payload.cwd;
			}
			return;
		}

		if (parsed.payload?.type !== "token_count") return;
		const usage = parsed.payload.info?.last_token_usage;
		if (!usage) return;

		const signature = JSON.stringify(usage);
		if (signature === state.previousDeltaSignature) return;
		state.previousDeltaSignature = signature;

		const timestampMs = entryTimestamp(parsed.timestamp, file.mtimeMs);
		const input = num(usage.input_tokens);
		const cached = num(usage.cached_input_tokens);
		state.entries.push({
			agent: "codex",
			model: state.currentModel ?? "unknown",
			timestampMs,
			cwd: state.currentCwd,
			sessionId,
			// OpenAI's input_tokens includes cached tokens; split them out.
			uncachedInput: Math.max(0, input - cached),
			cachedInput: cached,
			cacheWrite5m: num(usage.cache_write_input_tokens),
			cacheWrite1h: 0,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.reasoning_output_tokens),
		});
	};
	return { state, onLine, result: () => state };
}
