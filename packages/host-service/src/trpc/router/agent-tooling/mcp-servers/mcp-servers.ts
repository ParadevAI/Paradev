import { readFile, stat } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import type {
	McpServerEntry,
	McpServerScope,
} from "@superset/shared/mcp-servers";

export interface McpConfigPaths {
	homeDir: string;
	/** `~/.claude.json`, or `.claude.json` inside a custom CLAUDE_CONFIG_DIR. */
	claudeStatePath: string;
	codexConfigPath: string;
}

interface DiscoverMcpServersOptions {
	worktreePath: string;
	agent: string;
	paths: McpConfigPaths;
}

type McpServerAgent = "claude" | "codex";

interface FoundServer {
	name: string;
	agent: McpServerAgent;
	scope: McpServerScope;
	transport: string;
	url?: string;
	enabled: boolean;
	configPath: string;
	untrusted?: boolean;
}

const MAX_CONFIG_BYTES = 50 * 1024 * 1024;

export function isMcpServerAgent(agent: string): boolean {
	return agent === "claude" || agent === "codex";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

async function readText(path: string): Promise<string | null> {
	try {
		if ((await stat(path)).size > MAX_CONFIG_BYTES) return null;
		return await readFile(path, "utf-8");
	} catch {
		return null;
	}
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
	const raw = await readText(path);
	if (raw === null) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function projectDirs(
	worktreePath: string,
	homeDir: string,
): Promise<string[]> {
	const dirs: string[] = [];
	let dir = worktreePath;
	while (dir !== homeDir) {
		dirs.push(dir);
		if (await exists(join(dir, ".git"))) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return dirs;
}

function nearestPerName(): (servers: FoundServer[]) => FoundServer[] {
	const seen = new Set<string>();
	return (servers) =>
		servers.filter((server) => {
			if (seen.has(server.name)) return false;
			seen.add(server.name);
			return true;
		});
}

function jsonServers(
	servers: unknown,
	scope: McpServerScope,
	configPath: string,
	disabledNames: readonly string[],
): FoundServer[] {
	if (!isRecord(servers)) return [];
	return Object.entries(servers).flatMap(([name, config]): FoundServer[] => {
		if (!isRecord(config)) return [];
		const url = typeof config.url === "string" ? config.url : undefined;
		return [
			{
				name,
				agent: "claude",
				scope,
				...(url ? { url } : {}),
				transport:
					typeof config.type === "string"
						? config.type
						: url
							? "http"
							: "stdio",
				enabled:
					config.enabled !== false &&
					config.disabled !== true &&
					!disabledNames.includes(name),
				configPath,
			},
		];
	});
}

async function readClaudeServers(
	worktreePath: string,
	paths: McpConfigPaths,
): Promise<FoundServer[]> {
	const state = await readJson(paths.claudeStatePath);
	const projects = isRecord(state?.projects) ? state.projects : {};
	const project = isRecord(projects[worktreePath])
		? projects[worktreePath]
		: {};
	const disabled = stringList(project.disabledMcpServers);
	const disabledProjectFile = [
		...disabled,
		...stringList(project.disabledMcpjsonServers),
	];
	const found = [
		...jsonServers(state?.mcpServers, "user", paths.claudeStatePath, disabled),
		...jsonServers(
			project.mcpServers,
			"local",
			paths.claudeStatePath,
			disabled,
		),
	];
	const nearest = nearestPerName();
	for (const dir of await projectDirs(worktreePath, paths.homeDir)) {
		const file = join(dir, ".mcp.json");
		const config = await readJson(file);
		found.push(
			...nearest(
				jsonServers(config?.mcpServers, "project", file, disabledProjectFile),
			),
		);
	}
	return found;
}

const TOML_SERVER_TABLE =
	/^\s*\[\s*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*(\.[^\]]*)?\]/;

function tomlString(line: string, key: string): string | undefined {
	const match = line.match(
		new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`),
	);
	return match ? (match[1] ?? match[2]) : undefined;
}

function parseCodexMcpServers(
	content: string,
	scope: McpServerScope,
	configPath: string,
): FoundServer[] {
	const servers = new Map<string, FoundServer>();
	let current: FoundServer | null = null;
	for (const line of content.split(/\r?\n/)) {
		if (/^\s*\[/.test(line)) {
			const match = line.match(TOML_SERVER_TABLE);
			const name = match ? (match[1] ?? match[2] ?? match[3]) : undefined;
			if (!name) {
				current = null;
				continue;
			}
			const existing = servers.get(name);
			if (match?.[4]) {
				current = null;
				continue;
			}
			current = existing ?? {
				name,
				agent: "codex",
				scope,
				transport: "stdio",
				enabled: true,
				configPath,
			};
			servers.set(name, current);
			continue;
		}
		if (!current) continue;
		const url = tomlString(line, "url");
		if (url !== undefined) {
			current.transport = "http";
			current.url = url;
		}
		if (/^\s*enabled\s*=\s*false\b/.test(line)) current.enabled = false;
	}
	return [...servers.values()];
}

function parseCodexTrustedProjects(content: string): Set<string> {
	const trusted = new Set<string>();
	let project: string | null = null;
	for (const line of content.split(/\r?\n/)) {
		if (/^\s*\[/.test(line)) {
			const match = line.match(
				/^\s*\[\s*projects\.(?:"([^"]+)"|'([^']+)')\s*\]/,
			);
			project = match ? (match[1] ?? match[2] ?? null) : null;
			continue;
		}
		if (project && tomlString(line, "trust_level") === "trusted") {
			trusted.add(project);
		}
	}
	return trusted;
}

/** Codex trusts a git worktree through the repository it belongs to. */
async function trustRoots(dir: string): Promise<string[]> {
	const gitFile = await readText(join(dir, ".git"));
	const gitDir = gitFile?.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
	const mainRepo = gitDir?.split(`${sep}.git${sep}worktrees${sep}`)[0];
	return mainRepo && mainRepo !== gitDir ? [dir, mainRepo] : [dir];
}

async function readCodexServers(
	worktreePath: string,
	paths: McpConfigPaths,
): Promise<FoundServer[]> {
	const found: FoundServer[] = [];
	const user = await readText(paths.codexConfigPath);
	if (user !== null) {
		found.push(...parseCodexMcpServers(user, "user", paths.codexConfigPath));
	}
	const trusted = parseCodexTrustedProjects(user ?? "");
	const nearest = nearestPerName();
	for (const dir of await projectDirs(worktreePath, paths.homeDir)) {
		const file = join(dir, ".codex", "config.toml");
		const content = await readText(file);
		if (content === null) continue;
		const untrusted = !(await trustRoots(dir)).some((root) =>
			trusted.has(root),
		);
		found.push(
			...nearest(parseCodexMcpServers(content, "project", file)).map(
				(server) => (untrusted ? { ...server, untrusted } : server),
			),
		);
	}
	return found;
}

function compareEntries(a: McpServerEntry, b: McpServerEntry): number {
	return (
		a.name.localeCompare(b.name) ||
		a.agent.localeCompare(b.agent) ||
		a.scope.localeCompare(b.scope) ||
		a.configPath.localeCompare(b.configPath)
	);
}

/**
 * Every MCP server configured for Claude Code or Codex that applies in this
 * worktree. Reads files only: nothing is started or contacted.
 */
export async function discoverMcpServers({
	worktreePath,
	agent,
	paths,
}: DiscoverMcpServersOptions): Promise<McpServerEntry[]> {
	const [claude, codex] = await Promise.all([
		readClaudeServers(worktreePath, paths),
		readCodexServers(worktreePath, paths),
	]);
	return [...claude, ...codex]
		.map(
			(found): McpServerEntry => ({
				name: found.name,
				agent: found.agent,
				scope: found.scope,
				transport: found.transport,
				...(found.url ? { url: found.url } : {}),
				configPath: found.configPath,
				state:
					found.agent !== agent
						? "other-agent"
						: found.untrusted
							? "untrusted"
							: found.enabled
								? "available"
								: "disabled",
			}),
		)
		.sort(compareEntries);
}

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 64;
const cache = new Map<
	string,
	{ promise: Promise<McpServerEntry[]>; fetchedAt: number }
>();

export function listMcpServers(
	options: DiscoverMcpServersOptions & {
		refresh?: boolean;
		now?: () => number;
		discover?: typeof discoverMcpServers;
	},
): Promise<McpServerEntry[]> {
	const now = options.now ?? Date.now;
	const { paths } = options;
	const key = [
		options.worktreePath,
		options.agent,
		paths.claudeStatePath,
		paths.codexConfigPath,
	].join("::");
	const cached = cache.get(key);
	if (!options.refresh && cached && now() - cached.fetchedAt < CACHE_TTL_MS) {
		return cached.promise;
	}
	const promise = (options.discover ?? discoverMcpServers)(options);
	cache.delete(key);
	while (cache.size >= CACHE_MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
	cache.set(key, { promise, fetchedAt: now() });
	promise.catch(() => {
		if (cache.get(key)?.promise === promise) cache.delete(key);
	});
	return promise;
}

export function clearMcpServerCache(): void {
	cache.clear();
}
