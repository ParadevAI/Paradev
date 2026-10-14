import { describe, expect, test } from "bun:test";
import type { OpencodeMessageRow } from "./opencode-rows";
import { opencodeRowsToEntries } from "./opencode-rows";
import type { UsageLogEntry } from "./parse";

// Keep this test on the pure mapping module: the SQLite reader uses the
// Node-only better-sqlite3 native binding, while the unit suite runs in Bun.

const NOW = Date.parse("2026-09-08T01:34:44.000Z");

function row(
	data: Record<string, unknown>,
	over: Partial<OpencodeMessageRow> = {},
): OpencodeMessageRow {
	return {
		session_id: "ses_f8158c475ffe",
		data: JSON.stringify(data),
		directory: "/Users/me/worktrees/vivid-helenium",
		title: "OPENCODE_RESUME_VERIFIED",
		...over,
	};
}

const assistant = {
	role: "assistant",
	mode: "build",
	path: { cwd: "/Users/me/worktrees/vivid-helenium" },
	cost: 0.0,
	tokens: {
		total: 22470,
		input: 22459,
		output: 11,
		reasoning: 0,
		cache: { write: 0, read: 0 },
	},
	modelID: "gpt-5.5",
	providerID: "openai",
	time: { created: NOW - 2730, completed: NOW },
	finish: "stop",
};

describe("opencodeRowsToEntries", () => {
	test("maps assistant rows joined with their session title", () => {
		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		opencodeRowsToEntries([row(assistant)], 0, out, labels);
		expect(out).toEqual([
			{
				agent: "opencode",
				model: "gpt-5.5",
				timestampMs: NOW,
				cwd: "/Users/me/worktrees/vivid-helenium",
				sessionId: "ses_f8158c475ffe",
				uncachedInput: 22459,
				cachedInput: 0,
				cacheWrite5m: 0,
				cacheWrite1h: 0,
				output: 11,
				reasoningOutput: 0,
			},
		]);
		expect(labels.get("ses_f8158c475ffe")).toBe("OPENCODE_RESUME_VERIFIED");
	});

	test("carries a recorded cost and falls back to the session directory for cwd", () => {
		const out: UsageLogEntry[] = [];
		opencodeRowsToEntries(
			[
				row(
					{
						...assistant,
						path: undefined,
						cost: 0.998,
						tokens: { input: 10, output: 20, cache: { read: 300, write: 40 } },
					},
					{ directory: "/Users/me/proj" },
				),
			],
			0,
			out,
		);
		expect(out[0]).toMatchObject({
			cwd: "/Users/me/proj",
			costUsd: 0.998,
			cachedInput: 300,
			cacheWrite5m: 40,
		});
	});

	test("maps V2 session_message rows, which keep the role in the row type", () => {
		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		opencodeRowsToEntries(
			[
				row(
					{
						time: { created: NOW - 5000, completed: NOW },
						agent: "build",
						model: { id: "claude-opus-5-5", providerID: "anthropic" },
						finish: "stop",
						cost: 0.0311814,
						tokens: {
							input: 2,
							output: 232,
							reasoning: 51,
							cache: { read: 115517, write: 482 },
						},
					},
					{ type: "assistant" },
				),
				row({ time: { created: NOW } }, { type: "user" }),
			],
			0,
			out,
			labels,
		);
		expect(out).toEqual([
			{
				agent: "opencode",
				model: "claude-opus-5-5",
				timestampMs: NOW,
				cwd: "/Users/me/worktrees/vivid-helenium",
				sessionId: "ses_f8158c475ffe",
				uncachedInput: 2,
				cachedInput: 115517,
				cacheWrite5m: 482,
				cacheWrite1h: 0,
				output: 232,
				reasoningOutput: 51,
				costUsd: 0.0311814,
			},
		]);
		expect(labels.get("ses_f8158c475ffe")).toBe("OPENCODE_RESUME_VERIFIED");
	});

	test("skips user rows, rows before the cutoff, empty usage, and bad JSON", () => {
		const out: UsageLogEntry[] = [];
		opencodeRowsToEntries(
			[
				row({ role: "user", time: { created: NOW } }),
				row(assistant, { data: "{not json" }),
				row({ ...assistant, tokens: { input: 0, output: 0 } }),
			],
			0,
			out,
		);
		expect(out).toHaveLength(0);
		opencodeRowsToEntries([row(assistant)], NOW + 1, out);
		expect(out).toHaveLength(0);
	});
});
