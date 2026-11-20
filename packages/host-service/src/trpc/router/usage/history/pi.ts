/**
 * Pi / Oh My Pi usage (omp is a pi fork with the same session format).
 * Sessions are JSONL trees under `~/.pi/agent/sessions/--<encoded-cwd>--/`
 * (resp. `~/.omp/...`): a `{type:"session"}` header carrying the cwd, then
 * `{type:"message"}` entries whose assistant messages hold the model and a
 * usage block (input/output/cacheRead/cacheWrite plus a computed cost).
 * Entries are appended exactly once each — branching is by parent id — so no
 * cross-file dedupe is needed.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageAgent } from "../types";
import { type LineParser, type ParseLines, parseWholeFile } from "./line-cache";
import type { LogFile } from "./logs";
import { collectLogFiles } from "./logs";
import type { SessionFileResult, UsageLogEntry } from "./parse";
import {
	appendSessionFile,
	dropBefore,
	entryTimestamp,
	num,
	sessionIdForFile,
	toSessionLabel,
} from "./parse";

export function piSessionsRoot(agent: "pi" | "omp"): string {
	return join(homedir(), `.${agent}`, "agent", "sessions");
}

interface PiLine {
	type?: string;
	timestamp?: string;
	cwd?: string;
	message?: {
		role?: string;
		model?: string;
		timestamp?: number;
		content?: string | Array<{ type?: string; text?: string }>;
		usage?: {
			input?: number;
			output?: number;
			cacheRead?: number;
			cacheWrite?: number;
			cost?: { total?: number };
		};
	};
}

interface PiFileState extends SessionFileResult {
	sessionCwd: string | null;
}

function piFileParser(
	agent: UsageAgent,
	file: LogFile,
	state: PiFileState = { entries: [], label: null, sessionCwd: null },
): LineParser<SessionFileResult, PiFileState> {
	const sessionId = sessionIdForFile(file.path);
	const onLine = (line: string) => {
		const wantLabel = state.label === null;
		if (
			!line.includes('"session"') &&
			!line.includes('"assistant"') &&
			!(wantLabel && line.includes('"user"'))
		) {
			return;
		}
		let parsed: PiLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (parsed.type === "session") {
			if (typeof parsed.cwd === "string") state.sessionCwd = parsed.cwd;
			return;
		}
		if (parsed.type !== "message") return;
		const message = parsed.message;
		if (!message) return;

		if (wantLabel && message.role === "user") {
			const content = message.content;
			const text =
				typeof content === "string"
					? content
					: content?.find((block) => block.type === "text")?.text;
			state.label = toSessionLabel(text);
			return;
		}
		if (message.role !== "assistant") return;
		const usage = message.usage;
		if (!usage || !message.model) return;

		const timestampMs =
			typeof message.timestamp === "number" && message.timestamp > 0
				? message.timestamp
				: entryTimestamp(parsed.timestamp, file.mtimeMs);
		const cost = num(usage.cost?.total);
		state.entries.push({
			agent,
			model: message.model,
			timestampMs,
			cwd: state.sessionCwd,
			sessionId,
			// Pi stores the agent-reported input count, which excludes the
			// cache fields it tracks separately.
			uncachedInput: num(usage.input),
			cachedInput: num(usage.cacheRead),
			cacheWrite5m: num(usage.cacheWrite),
			cacheWrite1h: 0,
			output: num(usage.output),
			reasoningOutput: 0,
			...(cost > 0 ? { costUsd: cost } : {}),
		});
	};
	return {
		state,
		onLine,
		result: () => state,
		prune: (cutoffMs) =>
			dropBefore(state.entries, cutoffMs, (entry) => entry.timestampMs),
	};
}

/** Returns the number of session files scanned. */
export async function collectPiEntries(
	agent: "pi" | "omp",
	days: number,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	root: string = piSessionsRoot(agent),
	parseLines: ParseLines = parseWholeFile,
): Promise<number> {
	const files = await collectLogFiles(root, days + 1);
	for (const file of files) {
		const result = await parseLines(
			agent,
			file.path,
			(state?: PiFileState) => piFileParser(agent, file, state),
			cutoffMs,
		);
		appendSessionFile(
			result,
			sessionIdForFile(file.path),
			cutoffMs,
			out,
			sessionLabels,
		);
	}
	return files.length;
}
