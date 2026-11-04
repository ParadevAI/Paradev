import { statSync } from "node:fs";
import {
	parseClaudeLogFile,
	type UsageLogEntry,
} from "../../trpc/router/usage/history/parse";
import {
	costUsd,
	matchModelRate,
} from "../../trpc/router/usage/history/pricing";
import { locateHarnessSessionFile } from "./transcript";
import type { HarnessSessionRef } from "./types";

/**
 * Token, context and cost totals of one bound agent session, read from the
 * harness's own transcript. Cost is the API-list-rate estimate the usage
 * history uses, not money spent.
 */
export interface HarnessSessionUsage {
	model: string;
	/** Prompt tokens of the latest request: what the context holds now. */
	contextUsed: number;
	contextSize: number;
	/** Input across the session, cache reads and writes included. */
	inputTokens: number;
	cachedInputTokens: number;
	outputTokens: number;
	costUsd: number;
	/** True when a model was missing from the price table. */
	costApproximate: boolean;
	requests: number;
	updatedAt: number;
}

const DEFAULT_CONTEXT_SIZE = 1_000_000;
const LEGACY_CONTEXT_SIZE = 200_000;

/** Models whose standard window is 200K; every current Claude model has 1M. */
const LEGACY_CONTEXT_PREFIXES = [
	"claude-3",
	"claude-haiku-4-5",
	"claude-sonnet-4-5",
	"claude-sonnet-4-0",
	"claude-sonnet-4-2",
	"claude-opus-4-5",
	"claude-opus-4-0",
	"claude-opus-4-1",
	"claude-opus-4-2",
];

/**
 * The model's context window. A legacy model past 200K is running its 1M
 * beta, which the transcript does not record, so the usage itself decides.
 */
export function contextSizeFor(model: string, contextUsed: number): number {
	const normalized = model.toLowerCase();
	const legacy = LEGACY_CONTEXT_PREFIXES.some((prefix) =>
		normalized.startsWith(prefix),
	);
	if (!legacy || contextUsed > LEGACY_CONTEXT_SIZE) return DEFAULT_CONTEXT_SIZE;
	return LEGACY_CONTEXT_SIZE;
}

function promptTokens(entry: UsageLogEntry): number {
	return (
		entry.uncachedInput +
		entry.cachedInput +
		entry.cacheWrite5m +
		entry.cacheWrite1h
	);
}

export function summarizeSessionUsage(
	entries: readonly UsageLogEntry[],
	updatedAt: number,
): HarnessSessionUsage | null {
	const ordered = [...entries].sort((a, b) => a.timestampMs - b.timestampMs);
	const latest = ordered.at(-1);
	if (!latest) return null;
	let inputTokens = 0;
	let cachedInputTokens = 0;
	let outputTokens = 0;
	let cost = 0;
	let costApproximate = false;
	for (const entry of ordered) {
		const prompt = promptTokens(entry);
		inputTokens += prompt;
		cachedInputTokens += entry.cachedInput;
		outputTokens += entry.output;
		const rate = matchModelRate("claude", entry.model, prompt);
		cost += costUsd(rate, entry);
		costApproximate ||= rate.approximate;
	}
	const contextUsed = promptTokens(latest);
	return {
		model: latest.model,
		contextUsed,
		contextSize: contextSizeFor(latest.model, contextUsed),
		inputTokens,
		cachedInputTokens,
		outputTokens,
		costUsd: cost,
		costApproximate,
		requests: ordered.length,
		updatedAt,
	};
}

/**
 * Usage of a bound session. Only Claude records per-request usage in its
 * transcript; other harnesses answer null. Runs on a host worker: a session
 * file can run to hundreds of megabytes.
 */
export async function readHarnessSessionUsage(
	ref: HarnessSessionRef,
): Promise<HarnessSessionUsage | null> {
	if (ref.agentId !== "claude") return null;
	let path: string | null;
	try {
		path = locateHarnessSessionFile(ref);
	} catch {
		return null;
	}
	return path ? readClaudeUsageFile(path) : null;
}

/** Usage of one Claude transcript file: a session's or a subagent's. */
export async function readClaudeUsageFile(
	path: string,
): Promise<HarnessSessionUsage | null> {
	let mtimeMs: number;
	try {
		mtimeMs = statSync(path).mtimeMs;
	} catch {
		return null;
	}
	const byMessage = new Map<string, UsageLogEntry>();
	const unkeyed: UsageLogEntry[] = [];
	await parseClaudeLogFile({ path, mtimeMs }, byMessage, 0, unkeyed);
	return summarizeSessionUsage([...unkeyed, ...byMessage.values()], mtimeMs);
}
