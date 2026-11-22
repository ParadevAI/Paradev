import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PluginMcpServerConfig } from "@superset/shared/plugins";
import {
	getPdevMcpConfigPath,
	readExternallyConfiguredMcpServers,
	syncManagedMcpServers,
} from "./managed-mcp-servers";

const TEST_ROOT = path.join(
	os.tmpdir(),
	`superset-managed-mcp-${process.pid}-${Date.now()}`,
);
const HOME_DIR = path.join(TEST_ROOT, "home");
const SUPERSET_HOME = path.join(TEST_ROOT, "superset-home");

const claudeJson = path.join(HOME_DIR, ".claude.json");
const codexToml = path.join(HOME_DIR, ".codex", "config.toml");
const pdevJson = path.join(HOME_DIR, ".paradev", "agent", "mcp.json");
const ledgerPath = path.join(SUPERSET_HOME, "plugins", "mcp-ledger.json");

const LINEAR: PluginMcpServerConfig = {
	type: "http",
	url: "https://mcp.linear.app/mcp",
};
const PLAYWRIGHT: PluginMcpServerConfig = {
	command: "npx",
	args: ["-y", "@playwright/mcp@latest"],
};

function run(desired: Record<string, PluginMcpServerConfig>): void {
	syncManagedMcpServers(desired, {
		homeDir: HOME_DIR,
		supersetHomeDir: SUPERSET_HOME,
	});
}

function readClaude(): Record<string, unknown> {
	return JSON.parse(readFileSync(claudeJson, "utf-8"));
}

beforeEach(() => {
	mkdirSync(HOME_DIR, { recursive: true });
	mkdirSync(SUPERSET_HOME, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("syncManagedMcpServers — Claude", () => {
	it("creates ~/.claude.json with desired servers and a ledger", () => {
		run({ linear: LINEAR, playwright: PLAYWRIGHT });

		const root = readClaude();
		expect(root.mcpServers).toEqual({
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
			playwright: {
				type: "stdio",
				command: "npx",
				args: ["-y", "@playwright/mcp@latest"],
			},
		});
		const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
		expect(Object.keys(ledger.files[claudeJson])).toEqual([
			"linear",
			"playwright",
		]);
	});

	it("preserves unrelated keys and user servers in an existing file", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				hasCompletedOnboarding: true,
				mcpServers: { mine: { command: "my-server" } },
			}),
		);

		run({ linear: LINEAR });

		const root = readClaude();
		expect(root.hasCompletedOnboarding).toBe(true);
		expect(root.mcpServers).toEqual({
			mine: { command: "my-server" },
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
		});
	});

	it("never overwrites a user-defined server of the same name", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				mcpServers: { linear: { command: "user-linear" } },
			}),
		);

		run({ linear: LINEAR });

		expect(readClaude().mcpServers).toEqual({
			linear: { command: "user-linear" },
		});
		// Not tracked: uninstall must not reap the user's entry either.
		run({});
		expect(readClaude().mcpServers).toEqual({
			linear: { command: "user-linear" },
		});
	});

	it("reaps entries we wrote when they leave the desired set", () => {
		run({ linear: LINEAR, playwright: PLAYWRIGHT });
		run({ linear: LINEAR });

		expect(readClaude().mcpServers).toEqual({
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
		});
	});

	it("transfers ownership when the user edits a managed entry", () => {
		run({ linear: LINEAR });

		const root = readClaude();
		(root.mcpServers as Record<string, unknown>).linear = {
			type: "http",
			url: "https://example.com/custom",
		};
		writeFileSync(claudeJson, JSON.stringify(root));

		run({});

		expect(readClaude().mcpServers).toEqual({
			linear: { type: "http", url: "https://example.com/custom" },
		});
	});

	it("does not rewrite the file when already converged", () => {
		run({ linear: LINEAR });
		const before = statSync(claudeJson).mtimeMs;
		const raw = readFileSync(claudeJson, "utf-8");

		run({ linear: LINEAR });

		expect(readFileSync(claudeJson, "utf-8")).toBe(raw);
		expect(statSync(claudeJson).mtimeMs).toBe(before);
	});

	it("skips an unparseable file instead of clobbering it", () => {
		writeFileSync(claudeJson, "{ not json");

		run({ linear: LINEAR });

		expect(readFileSync(claudeJson, "utf-8")).toBe("{ not json");
	});

	it("creates nothing when desired is empty and no file exists", () => {
		run({});
		expect(existsSync(claudeJson)).toBe(false);
		expect(existsSync(codexToml)).toBe(false);
	});
});

describe("syncManagedMcpServers — pdev", () => {
	function readPdev() {
		return JSON.parse(readFileSync(pdevJson, "utf-8"));
	}

	it("writes HTTP auth helpers and stdio servers in pdev's global config", () => {
		run({
			linear: { ...LINEAR, headersHelper: "/bin/superset auth mcp-headers" },
			playwright: PLAYWRIGHT,
		});

		expect(readPdev().mcpServers).toEqual({
			linear: { ...LINEAR, headersHelper: "/bin/superset auth mcp-headers" },
			playwright: { type: "stdio", ...PLAYWRIGHT },
		});
		const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
		expect(Object.keys(ledger.files[pdevJson])).toEqual([
			"linear",
			"playwright",
		]);
		expect(statSync(pdevJson).mode & 0o777).toBe(0o600);
	});

	it("preserves user settings and servers through install and uninstall", () => {
		mkdirSync(path.dirname(pdevJson), { recursive: true });
		const original = {
			autoEnableCodemode: false,
			mcpServers: { mine: PLAYWRIGHT },
		};
		writeFileSync(pdevJson, JSON.stringify(original));
		run({ linear: LINEAR });
		expect(readPdev().mcpServers.linear).toEqual(LINEAR);
		run({});
		expect(readPdev()).toEqual(original);
	});

	it("leaves pre-existing and user-edited entries alone", () => {
		mkdirSync(path.dirname(pdevJson), { recursive: true });
		writeFileSync(
			pdevJson,
			JSON.stringify({ mcpServers: { linear: PLAYWRIGHT } }),
		);
		run({ linear: LINEAR, browser: PLAYWRIGHT });
		expect(readPdev().mcpServers.linear).toEqual(PLAYWRIGHT);
		const root = readPdev();
		root.mcpServers.browser = { command: "custom-browser" };
		writeFileSync(pdevJson, JSON.stringify(root));
		run({});
		expect(readPdev().mcpServers).toEqual({
			linear: PLAYWRIGHT,
			browser: { command: "custom-browser" },
		});
	});

	it("updates managed entries and does not rewrite a converged file", () => {
		run({ linear: LINEAR });
		const updated = { ...LINEAR, url: "https://example.com/mcp" };
		run({ linear: updated });
		expect(readPdev().mcpServers.linear).toEqual(updated);
		const before = statSync(pdevJson).mtimeMs;
		run({ linear: updated });
		expect(statSync(pdevJson).mtimeMs).toBe(before);
	});

	it("does not overwrite malformed configs", () => {
		mkdirSync(path.dirname(pdevJson), { recursive: true });
		for (const contents of ["not json", '{"mcpServers": []}', "[]"]) {
			writeFileSync(pdevJson, contents);
			run({ linear: LINEAR });
			expect(readFileSync(pdevJson, "utf-8")).toBe(contents);
		}
	});

	it("creates no config when there are no supported desired servers", () => {
		run({});
		expect(existsSync(pdevJson)).toBe(false);
		run({ legacy: { type: "sse", url: "https://example.com/sse" } });
		expect(existsSync(pdevJson)).toBe(false);
	});

	it("supports a custom pdev agent directory", () => {
		const pdevAgentDir = path.join(TEST_ROOT, "custom-agent");
		syncManagedMcpServers(
			{ linear: LINEAR },
			{
				homeDir: HOME_DIR,
				supersetHomeDir: SUPERSET_HOME,
				pdevAgentDir,
			},
		);
		expect(
			JSON.parse(readFileSync(path.join(pdevAgentDir, "mcp.json"), "utf-8"))
				.mcpServers.linear,
		).toEqual(LINEAR);
		expect(existsSync(pdevJson)).toBe(false);
	});

	it("stores absolute ledger keys for relative pdev directories", () => {
		const agentDir = path.join(TEST_ROOT, "relative-agent");
		const options = {
			homeDir: HOME_DIR,
			supersetHomeDir: SUPERSET_HOME,
			pdevAgentDir: path.relative(process.cwd(), agentDir),
		};
		const configPath = path.join(agentDir, "mcp.json");
		expect(getPdevMcpConfigPath(options)).toBe(configPath);
		syncManagedMcpServers({ linear: LINEAR }, options);
		const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
		expect(Object.keys(ledger.files[configPath])).toEqual(["linear"]);
	});

	it("saves Claude ownership and syncs Codex when pdev cannot be written", () => {
		writeFileSync(path.join(HOME_DIR, ".paradev"), "not a directory");

		expect(() => run({ linear: LINEAR })).toThrow();

		expect(readClaude().mcpServers).toEqual({ linear: LINEAR });
		const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
		expect(Object.keys(ledger.files[claudeJson])).toEqual(["linear"]);
		expect(ledger.files[pdevJson]).toBeUndefined();
		expect(readFileSync(codexToml, "utf-8")).toContain("[mcp_servers.linear]");

		run({});
		expect(readClaude().mcpServers).toEqual({});
		expect(existsSync(codexToml)).toBe(false);
	});

	it("resolves the pdev environment override without escaping a test home", () => {
		const previous = process.env.PDEV_CODING_AGENT_DIR;
		try {
			process.env.PDEV_CODING_AGENT_DIR = path.join(TEST_ROOT, "env-agent");
			expect(getPdevMcpConfigPath()).toBe(
				path.join(TEST_ROOT, "env-agent", "mcp.json"),
			);
			expect(getPdevMcpConfigPath({ homeDir: HOME_DIR })).toBe(pdevJson);
			expect(
				getPdevMcpConfigPath({ homeDir: HOME_DIR, pdevAgentDir: "~/custom" }),
			).toBe(path.join(HOME_DIR, "custom", "mcp.json"));
			process.env.PDEV_CODING_AGENT_DIR = "relative-agent";
			expect(getPdevMcpConfigPath()).toBe(
				path.resolve("relative-agent", "mcp.json"),
			);
			process.env.PDEV_CODING_AGENT_DIR = "";
			expect(getPdevMcpConfigPath()).toBe(
				path.join(os.homedir(), ".paradev", "agent", "mcp.json"),
			);
		} finally {
			if (previous === undefined) delete process.env.PDEV_CODING_AGENT_DIR;
			else process.env.PDEV_CODING_AGENT_DIR = previous;
		}
	});

	it("scopes externally configured pdev servers to pdev", () => {
		mkdirSync(path.dirname(pdevJson), { recursive: true });
		writeFileSync(
			pdevJson,
			JSON.stringify({ mcpServers: { customLinear: LINEAR } }),
		);
		run({ linear: LINEAR });
		expect(readPdev().mcpServers).toEqual({ customLinear: LINEAR });
		expect(readClaude().mcpServers).toEqual({ linear: LINEAR });
		expect(readFileSync(codexToml, "utf-8")).toContain("[mcp_servers.linear]");
	});
});

describe("syncManagedMcpServers — Codex", () => {
	it("appends a managed block with url and stdio tables", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(codexToml, 'model = "gpt-5"\n');

		run({ linear: LINEAR, playwright: PLAYWRIGHT });

		const content = readFileSync(codexToml, "utf-8");
		expect(content).toContain('model = "gpt-5"');
		expect(content).toContain("[mcp_servers.linear]");
		expect(content).toContain('url = "https://mcp.linear.app/mcp"');
		expect(content).toContain("[mcp_servers.playwright]");
		expect(content).toContain('command = "npx"');
		expect(content).toContain('args = ["-y", "@playwright/mcp@latest"]');
	});

	it("skips servers the user already defines outside the block", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(codexToml, '[mcp_servers.linear]\ncommand = "user-linear"\n');

		run({ linear: LINEAR, playwright: PLAYWRIGHT });

		const content = readFileSync(codexToml, "utf-8");
		const matches = content.match(/\[mcp_servers\.linear\]/g) ?? [];
		expect(matches.length).toBe(1);
		expect(content).toContain('command = "user-linear"');
		expect(content).toContain("[mcp_servers.playwright]");
	});

	it("removes the block on empty desired set, preserving user config", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(codexToml, 'model = "gpt-5"\n');
		run({ linear: LINEAR });

		run({});

		const content = readFileSync(codexToml, "utf-8");
		expect(content).toContain('model = "gpt-5"');
		expect(content).not.toContain("[mcp_servers.linear]");
		expect(content).not.toContain("superset managed mcp servers");
	});

	it("deletes a file that held only the managed block", () => {
		run({ linear: LINEAR });
		expect(existsSync(codexToml)).toBe(true);

		run({});

		expect(existsSync(codexToml)).toBe(false);
	});

	it("leaves an unrelated config byte-for-byte untouched when nothing is installed", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		// Trailing whitespace on purpose: the empty-desired boot sync must not
		// normalize a config we never wrote into.
		const original = 'model = "gpt-5"\n\n\n';
		writeFileSync(codexToml, original);

		run({});

		expect(readFileSync(codexToml, "utf-8")).toBe(original);
	});
});

describe("syncManagedMcpServers — per-agent external scoping", () => {
	it("keeps matching aliases in pdev and Codex separate", () => {
		mkdirSync(path.dirname(pdevJson), { recursive: true });
		writeFileSync(pdevJson, JSON.stringify({ mcpServers: { custom: LINEAR } }));
		mkdirSync(path.dirname(codexToml), { recursive: true });
		const codexConfig =
			'[mcp_servers.custom]\nurl = "https://mcp.linear.app/mcp"\n';
		writeFileSync(codexToml, codexConfig);

		run({ linear: LINEAR });

		expect(JSON.parse(readFileSync(pdevJson, "utf-8")).mcpServers).toEqual({
			custom: LINEAR,
		});
		expect(readFileSync(codexToml, "utf-8")).toBe(codexConfig);
		expect(
			readExternallyConfiguredMcpServers({
				homeDir: HOME_DIR,
				supersetHomeDir: SUPERSET_HOME,
			}),
		).toEqual([
			{ name: "custom", url: LINEAR.url, source: "Codex" },
			{ name: "custom", url: LINEAR.url, source: "pdev" },
		]);
	});

	it("a Codex-only user server does not suppress the Claude write", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(
			codexToml,
			'[mcp_servers.linear]\nurl = "https://mcp.linear.app/mcp"\n',
		);

		run({ linear: LINEAR });

		expect(readClaude().mcpServers).toEqual({
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
		});
		// Codex side stays the user's single table, no managed block added.
		const content = readFileSync(codexToml, "utf-8");
		expect(content.match(/\[mcp_servers\.linear\]/g)?.length).toBe(1);
		expect(content).not.toContain("superset managed mcp servers");
	});

	it("a user-scope server suppresses Claude but not Codex", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				mcpServers: {
					"linear-server": {
						type: "http",
						url: "https://mcp.linear.app/mcp",
					},
				},
			}),
		);

		run({ linear: LINEAR });

		// Theirs, in the scope we would have written. Left alone.
		expect(
			(readClaude().mcpServers as Record<string, unknown>).linear,
		).toBeUndefined();
		expect(readFileSync(codexToml, "utf-8")).toContain("[mcp_servers.linear]");
	});

	// A project entry applies to one directory; it used to match on the
	// "Claude Code" prefix and blank the user-scope server everywhere, so a
	// plugin installed with no entry and nothing said why.
	it("a project-scoped server does not suppress the user-scope entry", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				projects: {
					"/repo/a": {
						mcpServers: {
							"linear-server": {
								type: "http",
								url: "https://mcp.linear.app/mcp",
							},
						},
					},
				},
			}),
		);

		run({ linear: LINEAR });

		expect(
			(readClaude().mcpServers as Record<string, unknown>).linear,
		).toBeDefined();
		expect(readFileSync(codexToml, "utf-8")).toContain("[mcp_servers.linear]");
	});
});

describe("readExternallyConfiguredMcpServers", () => {
	function readExternal() {
		return readExternallyConfiguredMcpServers({
			homeDir: HOME_DIR,
			supersetHomeDir: SUPERSET_HOME,
		});
	}

	it("reports user-defined servers but never ledger-tracked ones", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({ mcpServers: { notion: { command: "notion-mcp" } } }),
		);

		run({ linear: LINEAR });

		expect(readExternal()).toEqual([
			{ name: "notion", command: "notion-mcp", source: "Claude Code" },
		]);
	});

	it("sweeps Claude project scopes, carrying urls for matching", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				projects: {
					"/repo/a": {
						mcpServers: {
							"linear-server": {
								type: "http",
								url: "https://mcp.linear.app/mcp",
							},
						},
					},
				},
			}),
		);

		expect(readExternal()).toEqual([
			{
				name: "linear-server",
				url: "https://mcp.linear.app/mcp",
				source: "Claude Code (project: a)",
			},
		]);
	});

	it("reports Codex tables outside the managed block only", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(
			codexToml,
			'[mcp_servers.posthog]\ncommand = "posthog-mcp"\nargs = ["--stdio"]\n',
		);

		run({ linear: LINEAR });

		expect(readExternal()).toEqual([
			{
				name: "posthog",
				command: "posthog-mcp",
				args: ["--stdio"],
				source: "Codex",
			},
		]);
	});

	it("reads single-quoted (TOML literal) Codex values", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(
			codexToml,
			"[mcp_servers.my-linear]\nurl = 'https://mcp.linear.app/mcp'\n",
		);

		expect(readExternal()).toEqual([
			{
				name: "my-linear",
				url: "https://mcp.linear.app/mcp",
				source: "Codex",
			},
		]);
	});

	it("returns empty when no configs exist", () => {
		expect(readExternal()).toEqual([]);
	});
});
