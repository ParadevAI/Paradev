import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	type ExternalMcpServer,
	isServerSatisfiedExternally,
	type PluginMcpServerConfig,
} from "@superset/shared/plugins";
import { writeFileIfChanged } from "./agent-wrappers-common";
import {
	ensureManagedTomlBlock,
	type ManagedTomlBlockSpec,
	removeManagedTomlBlock,
} from "./managed-toml-block";
import { resolveSupersetHomeDir } from "./paths";

/**
 * Materializes the MCP servers of installed Superset plugins into agent
 * configs, and reaps them on uninstall. Targets: Claude Code (`~/.claude.json`),
 * Codex (`~/.codex/config.toml`), and pdev (`~/.paradev/agent/mcp.json`).
 *
 * Ownership models differ per dialect because an MCP entry has no natural
 * fingerprint (unlike hooks, recognized by their notify-script path):
 *
 * - Claude's `mcpServers` is a name→object map inside a user-owned file, so a
 *   sidecar ledger (`~/.superset/plugins/mcp-ledger.json`) records which keys
 *   we wrote and a hash of each value. Reap removes only keys whose current
 *   value still matches what we wrote; a user-edited entry transfers to the
 *   user. A pre-existing key we never wrote is never touched.
 * - Codex's TOML gets a marker-delimited block (managed-toml-block engine),
 *   which carries its own ownership. Servers the user already defines outside
 *   the block are skipped — a duplicate `[mcp_servers.<name>]` table would be
 *   invalid TOML and break Codex outright.
 *
 * Like every writer here: an unparseable existing file is never clobbered,
 * and removal never creates files.
 */

export interface SyncManagedMcpServersOptions {
	/** Override for tests. */
	homeDir?: string;
	/** Override for tests; production resolves ~/.superset. */
	supersetHomeDir?: string;
	pdevAgentDir?: string;
}

export function getPdevMcpConfigPath(
	options: SyncManagedMcpServersOptions = {},
): string {
	const homeDir = options.homeDir ?? os.homedir();
	const override =
		options.pdevAgentDir ||
		(options.homeDir ? undefined : process.env.PDEV_CODING_AGENT_DIR);
	const agentDir = override || path.join(homeDir, ".paradev", "agent");
	const expanded =
		agentDir === "~"
			? homeDir
			: agentDir.startsWith("~/") ||
					(process.platform === "win32" && agentDir.startsWith("~\\"))
				? path.join(homeDir, agentDir.slice(2))
				: agentDir;
	return path.resolve(expanded, "mcp.json");
}

interface McpLedger {
	version: 1;
	/** absolute config path → (server name → hash of the value we wrote) */
	files: Record<string, Record<string, string>>;
}

function getLedgerPath(supersetHomeDir: string): string {
	return path.join(supersetHomeDir, "plugins", "mcp-ledger.json");
}

function readLedger(supersetHomeDir: string): McpLedger {
	const ledgerPath = getLedgerPath(supersetHomeDir);
	if (!fs.existsSync(ledgerPath)) return { version: 1, files: {} };
	try {
		const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof parsed.files === "object" &&
			parsed.files !== null
		) {
			return { version: 1, files: parsed.files };
		}
	} catch {
		// Fall through to a fresh ledger: worst case we stop reaping entries an
		// older ledger tracked, which errs on the never-delete side.
	}
	return { version: 1, files: {} };
}

function writeLedger(supersetHomeDir: string, ledger: McpLedger): void {
	const ledgerPath = getLedgerPath(supersetHomeDir);
	fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
	writeFileIfChanged(ledgerPath, JSON.stringify(ledger, null, 2), 0o600);
}

/** Stable across key order so a JSON round-trip doesn't fake an edit. */
export function hashMcpServerValue(value: unknown): string {
	const canonical = JSON.stringify(sortKeysDeep(value));
	return crypto.createHash("sha256").update(canonical).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, inner]) => [key, sortKeysDeep(inner)]),
		);
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Claude and pdev accept explicit stdio transport types. */
export function toJsonMcpServerValue(
	config: PluginMcpServerConfig,
): Record<string, unknown> {
	if ("url" in config) {
		return {
			type: config.type,
			url: config.url,
			...(config.headers ? { headers: config.headers } : {}),
			...(config.headersHelper ? { headersHelper: config.headersHelper } : {}),
		};
	}
	return {
		type: "stdio",
		command: config.command,
		...(config.args ? { args: [...config.args] } : {}),
		...(config.env ? { env: config.env } : {}),
	};
}

/**
 * Merges desired entries under ledger ownership without reformatting a
 * converged config.
 */
function syncJsonMcpServers(
	desired: Record<string, PluginMcpServerConfig>,
	filePath: string,
	agent: string,
	ledger: McpLedger,
): void {
	const tracked = ledger.files[filePath] ?? {};

	let rawAtRead: string | null = null;
	let root: Record<string, unknown>;
	if (fs.existsSync(filePath)) {
		try {
			rawAtRead = fs.readFileSync(filePath, "utf-8");
			const parsed = JSON.parse(rawAtRead);
			if (!isPlainObject(parsed)) {
				console.warn(
					`[agent-setup] Expected ${filePath} to contain a JSON object; skipping ${agent} MCP sync`,
				);
				return;
			}
			root = parsed;
		} catch (error) {
			console.warn(
				`[agent-setup] Could not parse existing ${filePath}; skipping ${agent} MCP sync:`,
				error,
			);
			return;
		}
	} else {
		if (Object.keys(desired).length === 0) {
			delete ledger.files[filePath];
			return;
		}
		root = {};
	}

	const hadContainer = "mcpServers" in root;
	const container = isPlainObject(root.mcpServers)
		? (root.mcpServers as Record<string, unknown>)
		: {};
	if (hadContainer && !isPlainObject(root.mcpServers)) {
		console.warn(
			`[agent-setup] ${filePath} has a non-object mcpServers; skipping ${agent} MCP sync`,
		);
		return;
	}

	let mutated = false;
	const nextTracked: Record<string, string> = {};

	// Reap entries we wrote that are no longer desired — unless the user
	// edited them since, in which case ownership transfers to the user.
	for (const [name, writtenHash] of Object.entries(tracked)) {
		if (name in desired) continue;
		const current = container[name];
		if (current !== undefined && hashMcpServerValue(current) === writtenHash) {
			delete container[name];
			mutated = true;
		}
	}

	for (const [name, config] of Object.entries(desired)) {
		const value = toJsonMcpServerValue(config);
		const valueHash = hashMcpServerValue(value);
		const current = container[name];

		if (current !== undefined && !(name in tracked)) {
			// The user defined this server themselves before we got here;
			// their entry wins and stays theirs.
			continue;
		}
		if (
			current !== undefined &&
			name in tracked &&
			hashMcpServerValue(current) !== tracked[name]
		) {
			// We wrote it once, the user edited it since: theirs now.
			continue;
		}
		if (current === undefined || hashMcpServerValue(current) !== valueHash) {
			container[name] = value;
			mutated = true;
		}
		nextTracked[name] = valueHash;
	}

	// Concurrency guard: Claude Code rewrites this file while it runs, and a
	// write landing between our read and our write would be clobbered wholesale
	// (the file holds far more than mcpServers). If the file changed since we
	// read it, skip this round — ledger untouched — and let the next sync
	// converge. A write inside the remaining read-check-rename window can still
	// lose, but the window is milliseconds instead of the whole merge.
	if (mutated) {
		try {
			const rawNow = fs.existsSync(filePath)
				? fs.readFileSync(filePath, "utf-8")
				: null;
			if (rawNow !== rawAtRead) {
				console.warn(
					`[agent-setup] ${filePath} changed during sync; skipping this round`,
				);
				return;
			}
		} catch {
			return;
		}
	}

	if (mutated) {
		if (Object.keys(container).length > 0 || hadContainer) {
			root.mcpServers = container;
		}
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileIfChanged(filePath, JSON.stringify(root, null, 2), 0o600);
		console.log(`[agent-setup] Updated ${agent} mcpServers`);
	}

	if (Object.keys(nextTracked).length === 0) {
		delete ledger.files[filePath];
	} else {
		ledger.files[filePath] = nextTracked;
	}
}

export const CODEX_MARKER_START = "# >>> superset managed mcp servers >>>";
export const CODEX_MARKER_END = "# <<< superset managed mcp servers <<<";

function tomlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function codexServerTable(name: string, config: PluginMcpServerConfig): string {
	const lines = [`[mcp_servers.${name}]`];
	if ("url" in config) {
		lines.push(`url = ${tomlString(config.url)}`);
		if (config.headers && Object.keys(config.headers).length > 0) {
			// Codex's key for static request headers is `http_headers`.
			const pairs = Object.entries(config.headers)
				.map(([key, val]) => `${tomlString(key)} = ${tomlString(val)}`)
				.join(", ");
			lines.push(`http_headers = { ${pairs} }`);
		}
		// Codex's spelling of Claude's `headersHelper`. Same contract: a command
		// printing a JSON object of headers, re-run when the server rejects.
		if (config.headersHelper) {
			lines.push(`http_headers_helper = ${tomlString(config.headersHelper)}`);
		}
	} else {
		lines.push(`command = ${tomlString(config.command)}`);
		if (config.args && config.args.length > 0) {
			lines.push(
				`args = [${config.args.map((arg) => tomlString(arg)).join(", ")}]`,
			);
		}
		if (config.env && Object.keys(config.env).length > 0) {
			const pairs = Object.entries(config.env)
				.map(([key, val]) => `${key} = ${tomlString(val)}`)
				.join(", ");
			lines.push(`env = { ${pairs} }`);
		}
	}
	return lines.join("\n");
}

function codexMcpSpec(
	desired: Record<string, PluginMcpServerConfig>,
	homeDir: string,
): ManagedTomlBlockSpec {
	return {
		markerStart: CODEX_MARKER_START,
		markerEnd: CODEX_MARKER_END,
		getFilePath: () => path.join(homeDir, ".codex", "config.toml"),
		fileLabel: "Codex config.toml",
		removeLabel: "Codex managed MCP servers",
		fileMode: 0o644,
		isManagedTable: (tableLines) =>
			/^\s*\[mcp_servers\./.test(tableLines[0] ?? ""),
		buildBlock: (base) => {
			// A user-defined [mcp_servers.<name>] outside our block wins: a
			// duplicate TOML table would break Codex's config parse entirely.
			const entries = Object.entries(desired).filter(([name]) => {
				const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				return !new RegExp(`^\\s*\\[mcp_servers\\.${escaped}[\\].]`, "m").test(
					base,
				);
			});
			if (entries.length === 0) return "";
			return [
				CODEX_MARKER_START,
				"# Managed by Superset — do not edit inside this block. Entries",
				"# converge on the plugins installed in the Superset desktop app.",
				...entries.map(([name, config]) => codexServerTable(name, config)),
				CODEX_MARKER_END,
			].join("\n");
		},
	};
}

/**
 * Server names the user configured in agent configs *outside* Superset:
 * `mcpServers` keys in ~/.claude.json the ledger doesn't track, plus
 * `[mcp_servers.<name>]` tables in Codex's config.toml outside our managed
 * block. Read-only — lets the catalog mark such plugins "already set up"
 * instead of offering Install. Unreadable files contribute nothing.
 */
export function readExternallyConfiguredMcpServers(
	options: SyncManagedMcpServersOptions = {},
): ExternalMcpServer[] {
	const homeDir = options.homeDir ?? os.homedir();
	const supersetHomeDir = options.supersetHomeDir ?? resolveSupersetHomeDir();
	const ledger = readLedger(supersetHomeDir);
	const bySourceAndName = new Map<string, ExternalMcpServer>();

	const record = (name: string, config: unknown, source: string) => {
		const key = JSON.stringify([source, name]);
		if (bySourceAndName.has(key) || !isPlainObject(config)) return;
		bySourceAndName.set(key, {
			name,
			...(typeof config.url === "string" ? { url: config.url } : {}),
			...(typeof config.command === "string"
				? { command: config.command }
				: {}),
			...(Array.isArray(config.args)
				? {
						args: config.args.filter((a): a is string => typeof a === "string"),
					}
				: {}),
			source,
		});
	};

	// Claude: user scope (mcpServers keys the ledger doesn't track) plus every
	// project scope — `claude mcp add` defaults to project scope, so most
	// hand-added servers live under projects[*].mcpServers.
	const claudePath = path.join(homeDir, ".claude.json");
	const tracked = ledger.files[claudePath] ?? {};
	if (fs.existsSync(claudePath)) {
		try {
			const root = JSON.parse(fs.readFileSync(claudePath, "utf-8"));
			if (isPlainObject(root)) {
				if (isPlainObject(root.mcpServers)) {
					for (const [name, config] of Object.entries(root.mcpServers)) {
						if (!(name in tracked)) record(name, config, "Claude Code");
					}
				}
				if (isPlainObject(root.projects)) {
					for (const [projectPath, project] of Object.entries(root.projects)) {
						if (!isPlainObject(project)) continue;
						if (!isPlainObject(project.mcpServers)) continue;
						for (const [name, config] of Object.entries(project.mcpServers)) {
							record(
								name,
								config,
								`Claude Code (project: ${path.basename(projectPath)})`,
							);
						}
					}
				}
			}
		} catch {
			// Unparseable file: report nothing rather than guessing.
		}
	}

	const pdevPath = getPdevMcpConfigPath(options);
	try {
		const root = JSON.parse(fs.readFileSync(pdevPath, "utf-8"));
		if (isPlainObject(root) && isPlainObject(root.mcpServers)) {
			const pdevTracked = ledger.files[pdevPath] ?? {};
			for (const [name, config] of Object.entries(root.mcpServers)) {
				if (!(name in pdevTracked)) record(name, config, "pdev");
			}
		}
	} catch {}

	// Cursor's global config; tolerate the JSONC comments Cursor allows.
	const cursorPath = path.join(homeDir, ".cursor", "mcp.json");
	if (fs.existsSync(cursorPath)) {
		try {
			const raw = fs
				.readFileSync(cursorPath, "utf-8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^\s*\/\/.*$/gm, "");
			const root = JSON.parse(raw);
			if (isPlainObject(root) && isPlainObject(root.mcpServers)) {
				for (const [name, config] of Object.entries(root.mcpServers)) {
					record(name, config, "Cursor");
				}
			}
		} catch {
			// Best effort only.
		}
	}

	const codexPath = path.join(homeDir, ".codex", "config.toml");
	let codexContent: string | null = null;
	try {
		codexContent = fs.existsSync(codexPath)
			? fs.readFileSync(codexPath, "utf-8")
			: null;
	} catch {
		// Unreadable file contributes nothing, per the contract above.
	}
	if (codexContent !== null) {
		const content = codexContent;
		const start = content.indexOf(CODEX_MARKER_START);
		const end = content.indexOf(CODEX_MARKER_END);
		const outsideBlock =
			start !== -1 && end !== -1
				? content.slice(0, start) + content.slice(end + CODEX_MARKER_END.length)
				: content;
		// Line-level parse of each [mcp_servers.<name>] table: enough for
		// matching (url/command), no TOML parser needed.
		const tables = outsideBlock.split(/^\s*\[/m);
		// Values may be TOML basic ("...") or literal ('...') strings; both
		// are read so a single-quoted url still matches for dedup.
		const stringValue = (source: string, key: string) => {
			const match = source.match(
				new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, "m"),
			);
			return match?.[1] ?? match?.[2];
		};
		for (const table of tables) {
			const header = table.match(/^mcp_servers\.([A-Za-z0-9_-]+)\]/);
			const name = header?.[1];
			if (name === undefined) continue;
			const url = stringValue(table, "url");
			const command = stringValue(table, "command");
			const argsRaw = table.match(/^\s*args\s*=\s*\[([^\]]*)\]/m)?.[1];
			const args = argsRaw
				? [...argsRaw.matchAll(/"([^"]*)"|'([^']*)'/g)].map(
						(m) => m[1] ?? m[2] ?? "",
					)
				: undefined;
			record(name, { url, command, args }, "Codex");
		}
	}

	return [...bySourceAndName.values()].sort(
		(a, b) =>
			a.name.localeCompare(b.name) ||
			(a.source ?? "").localeCompare(b.source ?? ""),
	);
}

export function getDesiredMcpServersByAgent(
	desired: Record<string, PluginMcpServerConfig>,
	options: SyncManagedMcpServersOptions = {},
) {
	const external = readExternallyConfiguredMcpServers(options);
	const desiredForScope = (matches: (source: string) => boolean) => {
		const scoped = external.filter(
			(server) => server.source === undefined || matches(server.source),
		);
		return Object.fromEntries(
			Object.entries(desired).filter(
				([name, config]) => !isServerSatisfiedExternally(name, config, scoped),
			),
		);
	};

	return {
		claude: desiredForScope((source) => source === "Claude Code"),
		codex: desiredForScope((source) => source === "Codex"),
		pdev: Object.fromEntries(
			Object.entries(desiredForScope((source) => source === "pdev")).filter(
				([, config]) => !("url" in config && config.type === "sse"),
			),
		),
	};
}

/**
 * Converges every managed agent config on `desired` (server name → config).
 * Installing writes entries, uninstalling reaps them; call sites pass the
 * full desired set derived from installed plugins, never deltas.
 *
 * Servers the user already configured themselves satisfy the plugin — but
 * only for the agent they configured them in: a hand-written Codex table
 * must not suppress (or reap) the Claude entry, and vice versa. Each
 * writer's desired set is therefore filtered against externals from its own
 * scope only.
 */
export function syncManagedMcpServers(
	desired: Record<string, PluginMcpServerConfig>,
	options: SyncManagedMcpServersOptions = {},
): void {
	const homeDir = options.homeDir ?? os.homedir();
	const supersetHomeDir = options.supersetHomeDir ?? resolveSupersetHomeDir();
	const scoped = getDesiredMcpServersByAgent(desired, options);
	const errors: unknown[] = [];
	const attempt = (sync: () => void) => {
		try {
			sync();
		} catch (error) {
			errors.push(error);
		}
	};

	for (const [name, config] of Object.entries(desired)) {
		if ("url" in config && config.type === "sse") {
			console.warn(`[agent-setup] pdev does not support SSE server ${name}`);
		}
	}

	const ledger = readLedger(supersetHomeDir);
	attempt(() =>
		syncJsonMcpServers(
			scoped.claude,
			path.join(homeDir, ".claude.json"),
			"Claude",
			ledger,
		),
	);
	attempt(() =>
		syncJsonMcpServers(
			scoped.pdev,
			getPdevMcpConfigPath(options),
			"pdev",
			ledger,
		),
	);
	attempt(() => writeLedger(supersetHomeDir, ledger));
	attempt(() => {
		const spec = codexMcpSpec(scoped.codex, homeDir);
		if (Object.keys(scoped.codex).length === 0) {
			// Removing an absent block would reformat a user-owned config.
			if (
				fs.existsSync(spec.getFilePath()) &&
				fs
					.readFileSync(spec.getFilePath(), "utf-8")
					.includes(CODEX_MARKER_START)
			) {
				removeManagedTomlBlock(spec);
			}
		} else {
			ensureManagedTomlBlock(spec);
		}
	});

	if (errors.length > 0) {
		const details = errors
			.map((error) => (error instanceof Error ? error.message : String(error)))
			.join("; ");
		throw new AggregateError(
			errors,
			`Failed to sync agent MCP configs: ${details}`,
		);
	}
}
