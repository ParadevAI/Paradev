import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../../../../db";
import type { UsageHistory } from "./aggregate";
import { countWrappedPrs, summarizeWrapped } from "./wrapped";

test("counts merged PRs once and attributes only agents present before merge", () => {
	const sqlite = new Database(":memory:");
	try {
		sqlite.exec(`
			CREATE TABLE pull_requests (id TEXT, merged_at INTEGER);
			CREATE TABLE workspace_pull_requests (pull_request_id TEXT, workspace_id TEXT);
			CREATE TABLE terminal_agent_bindings (terminal_id TEXT, workspace_id TEXT, agent_id TEXT, started_at INTEGER);
			CREATE TABLE workspaces (id TEXT, archived_at INTEGER);
		`);
		const now = new Date(2026, 10, 5, 12);
		const merged = new Date(2026, 10, 5, 8).getTime();
		sqlite.query("INSERT INTO pull_requests VALUES (?, ?)").run("pr", merged);
		sqlite
			.query("INSERT INTO pull_requests VALUES (?, ?)")
			.run("archived-pr", merged);
		sqlite
			.query("INSERT INTO pull_requests VALUES (?, ?)")
			.run("future-pr", now.getTime() + 1);
		sqlite.exec(`
			INSERT INTO workspace_pull_requests VALUES ('pr', 'ws'), ('pr', 'ws2'), ('archived-pr', 'archived'), ('future-pr', 'ws');
			INSERT INTO workspaces VALUES ('ws', NULL), ('ws2', NULL), ('archived', 1);
		`);
		const bind = sqlite.query(
			"INSERT INTO terminal_agent_bindings VALUES (?, ?, ?, ?)",
		);
		bind.run("a", "ws", "claude", merged - 1);
		bind.run("b", "ws", "claude", merged - 1);
		bind.run("c", "ws2", "codex", merged - 1);
		bind.run("d", "ws", "grok", merged + 1);
		expect(
			countWrappedPrs(drizzle(sqlite) as unknown as HostDb, 30, now),
		).toEqual({ total: 2, byAgent: { claude: 1, codex: 1 } });
	} finally {
		sqlite.close();
	}
});

test("summarizes usage without project, prompt, or session metadata", () => {
	const history = {
		buckets: [
			{
				day: "2026-11-01",
				tokens: 2,
				agents: { claude: { tokens: 2, usd: 1 } },
			},
			{ day: "2026-11-02", tokens: 0, agents: {} },
			{
				day: "2026-11-03",
				tokens: 4,
				agents: { codex: { tokens: 4, usd: 2 } },
			},
			{
				day: "2026-11-04",
				tokens: 5,
				agents: { codex: { tokens: 5, usd: 3 } },
			},
		],
		totals: { tokens: 11, usd: 6 },
		models: [
			{ model: "expensive", tokens: 2, usd: 5 },
			{ model: "popular", tokens: 9, usd: 1 },
		],
		projects: [{ project: "secret-repo" }],
		projectDetails: {
			"secret-repo": { sessions: [{ label: "secret-prompt" }] },
		},
	} as unknown as UsageHistory;
	const summary = summarizeWrapped(history, {
		total: 3,
		byAgent: { claude: 2, codex: 1 },
	});
	expect(summary.longestStreak).toBe(2);
	expect(summary.topModel).toBe("popular");
	expect(summary.agents).toEqual([
		{ agent: "codex", tokens: 9, usd: 5, prs: 1 },
		{ agent: "claude", tokens: 2, usd: 1, prs: 2 },
	]);
	expect(JSON.stringify(summary)).not.toContain("secret");
});
