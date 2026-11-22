import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServerEntry } from "@superset/shared/mcp-servers";
import {
	clearMcpServerCache,
	discoverMcpServers,
	listMcpServers,
	type McpConfigPaths,
} from "./mcp-servers";

let home: string;
let worktree: string;
let paths: McpConfigPaths;

function write(path: string, content: unknown): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(
		path,
		typeof content === "string" ? content : JSON.stringify(content),
	);
}

function byName(servers: McpServerEntry[], name: string, agent?: string) {
	return servers.filter(
		(server) =>
			server.name === name && (agent === undefined || server.agent === agent),
	);
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "mcp-servers-"));
	worktree = join(home, "repo");
	mkdirSync(join(worktree, ".git"), { recursive: true });
	paths = {
		homeDir: home,
		claudeStatePath: join(home, ".claude.json"),
		codexConfigPath: join(home, ".codex", "config.toml"),
	};
	clearMcpServerCache();
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

describe("discoverMcpServers", () => {
	it("reads Claude user, local, and project scopes and applies its disabled list", async () => {
		write(paths.claudeStatePath, {
			mcpServers: { docs: { type: "http", url: "https://docs.example/mcp" } },
			projects: {
				[worktree]: {
					mcpServers: { local: { command: "node", args: ["server.js"] } },
					disabledMcpServers: ["docs"],
				},
			},
		});
		write(join(worktree, ".mcp.json"), {
			mcpServers: { shared: { command: "npx" } },
		});

		const servers = await discoverMcpServers({
			worktreePath: worktree,
			agent: "claude",
			paths,
		});

		expect(byName(servers, "docs")[0]).toMatchObject({
			scope: "user",
			transport: "http",
			state: "disabled",
		});
		expect(byName(servers, "local")[0]).toMatchObject({
			scope: "local",
			transport: "stdio",
			state: "available",
		});
		expect(byName(servers, "shared")[0]).toMatchObject({
			scope: "project",
			configPath: join(worktree, ".mcp.json"),
			state: "available",
		});
	});

	it("reads Codex tables, ignores their sub-tables, and marks them for the other agent", async () => {
		write(
			paths.codexConfigPath,
			[
				"model = 'x'",
				"[mcp_servers.repl]",
				'command = "node"',
				"[mcp_servers.repl.env]",
				'url = "https://not-a-server.example"',
				'[mcp_servers."off"]',
				"url = 'https://off.example/mcp'",
				"enabled = false",
			].join("\n"),
		);

		const servers = await discoverMcpServers({
			worktreePath: worktree,
			agent: "claude",
			paths,
		});

		expect(byName(servers, "repl", "codex")[0]).toMatchObject({
			transport: "stdio",
			state: "other-agent",
		});
		expect(byName(servers, "off", "codex")[0]).toMatchObject({
			transport: "http",
			state: "other-agent",
		});
	});

	it("marks Codex project servers untrusted unless the project or its main repository is trusted", async () => {
		const main = join(home, "main");
		const linked = join(home, "linked");
		mkdirSync(join(main, ".git", "worktrees", "linked"), { recursive: true });
		mkdirSync(linked, { recursive: true });
		write(join(linked, ".git"), `gitdir: ${main}/.git/worktrees/linked\n`);
		for (const dir of [worktree, linked]) {
			write(
				join(dir, ".codex", "config.toml"),
				"[mcp_servers.repo]\ncommand = 'node'\n",
			);
		}
		write(
			paths.codexConfigPath,
			`[projects."${main}"]\ntrust_level = "trusted"\n`,
		);

		const untrusted = await discoverMcpServers({
			worktreePath: worktree,
			agent: "codex",
			paths,
		});
		const trusted = await discoverMcpServers({
			worktreePath: linked,
			agent: "codex",
			paths,
		});

		expect(byName(untrusted, "repo")[0]?.state).toBe("untrusted");
		expect(byName(trusted, "repo")[0]?.state).toBe("available");
	});

	it("keeps only the nearest project definition of a server", async () => {
		const nested = join(worktree, "packages", "app");
		write(join(nested, ".mcp.json"), {
			mcpServers: { docs: { command: "near" } },
		});
		write(join(worktree, ".mcp.json"), {
			mcpServers: { docs: { command: "far" } },
		});

		const servers = await discoverMcpServers({
			worktreePath: nested,
			agent: "claude",
			paths,
		});

		expect(byName(servers, "docs").map((server) => server.configPath)).toEqual([
			join(nested, ".mcp.json"),
		]);
	});
});

describe("listMcpServers", () => {
	it("serves a cached read until asked to refresh", async () => {
		let reads = 0;
		const discover = async () => {
			reads += 1;
			return [];
		};
		const options = {
			worktreePath: worktree,
			agent: "claude",
			paths,
			discover,
		};

		await listMcpServers(options);
		await listMcpServers(options);
		expect(reads).toBe(1);

		await listMcpServers({ ...options, refresh: true });
		expect(reads).toBe(2);
	});
});
