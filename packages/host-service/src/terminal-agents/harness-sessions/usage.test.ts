import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeProjectDirName } from "@superset/agent-setup/claude-project-links";
import type { UsageLogEntry } from "../../trpc/router/usage/history/parse";
import {
	contextSizeFor,
	readClaudeUsageFile,
	readHarnessSessionUsage,
	summarizeSessionUsage,
} from "./usage";

const created: string[] = [];

afterEach(() => {
	for (const path of created.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

function entry(overrides: Partial<UsageLogEntry>): UsageLogEntry {
	return {
		agent: "claude",
		model: "claude-sonnet-5-5",
		timestampMs: 0,
		cwd: null,
		sessionId: "s",
		uncachedInput: 0,
		cachedInput: 0,
		cacheWrite5m: 0,
		cacheWrite1h: 0,
		output: 0,
		reasoningOutput: 0,
		...overrides,
	};
}

describe("contextSizeFor", () => {
	test("current models have a 1M window", () => {
		expect(contextSizeFor("claude-opus-5-5", 10)).toBe(1_000_000);
		expect(contextSizeFor("claude-sonnet-5-5", 10)).toBe(1_000_000);
	});

	test("legacy models have 200K until usage proves the 1M beta", () => {
		expect(contextSizeFor("claude-haiku-4-5-20251001", 10)).toBe(200_000);
		expect(contextSizeFor("claude-sonnet-4-5", 250_000)).toBe(1_000_000);
	});
});

describe("summarizeSessionUsage", () => {
	test("null without requests", () => {
		expect(summarizeSessionUsage([], 0)).toBeNull();
	});

	test("context is the latest request's prompt; totals sum every request", () => {
		const usage = summarizeSessionUsage(
			[
				entry({
					timestampMs: 2,
					uncachedInput: 10,
					cachedInput: 1_000,
					cacheWrite1h: 90,
					output: 50,
				}),
				entry({
					timestampMs: 1,
					uncachedInput: 100,
					cacheWrite5m: 400,
					output: 20,
				}),
			],
			5,
		);
		expect(usage).toMatchObject({
			model: "claude-sonnet-5-5",
			contextUsed: 1_100,
			contextSize: 1_000_000,
			inputTokens: 1_600,
			cachedInputTokens: 1_000,
			outputTokens: 70,
			requests: 2,
			costApproximate: false,
			updatedAt: 5,
		});
		// Sonnet 5.x: $2 in, $10 out, cache read 0.1x, writes 1.25x / 2x input.
		const expected =
			(110 * 2 + 70 * 10 + 1_000 * 0.2 + 400 * 2.5 + 90 * 4) / 1e6;
		expect(usage?.costUsd).toBeCloseTo(expected, 10);
	});
});

describe("readHarnessSessionUsage", () => {
	test("reads the Claude transcript and dedupes streamed lines", async () => {
		const configDir = mkdtempSync(join(tmpdir(), "session-usage-"));
		const worktreePath = realpathSync(
			mkdtempSync(join(tmpdir(), "session-usage-wt-")),
		);
		created.push(configDir, worktreePath);
		const sessionId = "11111111-2222-3333-4444-555555555555";
		const projectDir = join(
			configDir,
			"projects",
			claudeProjectDirName(worktreePath),
		);
		mkdirSync(projectDir, { recursive: true });
		const path = join(projectDir, `${sessionId}.jsonl`);
		const line = (output: number) =>
			JSON.stringify({
				type: "assistant",
				sessionId,
				requestId: "req_1",
				timestamp: "2026-11-03T10:00:00.000Z",
				message: {
					id: "msg_1",
					model: "claude-opus-5-5",
					usage: {
						input_tokens: 5,
						cache_read_input_tokens: 2_000,
						cache_creation_input_tokens: 300,
						cache_creation: {
							ephemeral_5m_input_tokens: 0,
							ephemeral_1h_input_tokens: 300,
						},
						output_tokens: output,
					},
				},
			});
		writeFileSync(path, `${line(10)}\n${line(40)}\n`);

		const usage = await readHarnessSessionUsage({
			agentId: "claude",
			sessionId,
			worktreePath,
			env: { CLAUDE_CONFIG_DIR: configDir },
		});
		expect(usage).toMatchObject({
			model: "claude-opus-5-5",
			contextUsed: 2_305,
			outputTokens: 40,
			requests: 1,
		});
	});

	test("a subagent file not yet flushed has no usage", async () => {
		expect(
			await readClaudeUsageFile(join(tmpdir(), "no-such-agent.jsonl")),
		).toBeNull();
	});

	test("other harnesses record no usage", async () => {
		expect(
			await readHarnessSessionUsage({ agentId: "codex", sessionId: "x" }),
		).toBeNull();
	});
});
