/**
 * Pre-trusts a host-created folder in the launching agent CLIs' trust
 * stores, so their first interactive launch skips the "do you trust this
 * folder?" dialog. Session folders need this because they are standalone
 * repos: agent CLIs treat a git repo root as its own trust domain (worktrees
 * inherit from the main checkout, plain dirs from trusted ancestors, but a
 * fresh standalone repo inherits nothing), so every new session would
 * otherwise prompt. Auto-trusting is sound only because the host itself just
 * created the folder as an empty scaffold — never seed a folder with
 * pre-existing user content. A multi-repo root links the agent config
 * (hooks, MCP servers) of one of its repositories, so it is seeded only when
 * the user already trusts that repository in the same store.
 *
 * Each store is the CLI's own sanctioned escape hatch: Claude's untrusted-
 * folder error says to set `projects[<path>].hasTrustDialogAccepted: true`
 * in its state file, Codex persists `trust_level = "trusted"` in
 * config.toml the same way, and Antigravity lists trusted folders under
 * `trustedWorkspaces` in its settings.json. Everything here is best-effort — a failed seed
 * just means the dialog shows once.
 */

import { existsSync, realpathSync } from "node:fs";
import {
	chmod,
	mkdtemp,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveWriteTarget } from "@superset/agent-setup";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import { hostAgentConfigs, projects, workspaces } from "../../../../db/schema";
import {
	resolveHostAgentConfig,
	rowToConfig,
} from "../../../../terminal-agents/agent-config";
import {
	configSourceCheckout,
	listWorkspaceCheckouts,
} from "../../../../workspaces/checkouts";
import { resolveDefaultAccountEnv } from "../../usage/default-account";

type TrustFamily = "claude" | "codex" | "agy";

interface TrustTarget {
	family: TrustFamily;
	file: string;
}

/**
 * Provider family of an agent config, from its preset id or launch
 * executable. The executable check covers custom presets that still run the
 * stock `claude`/`codex` binaries (possibly via absolute paths or wrappers
 * named after them).
 */
export function resolveTrustFamily(config: {
	presetId: string;
	command: string;
}): TrustFamily | null {
	const [token = ""] = config.command.trim().split(/\s+/);
	const executable = (token.split(/[\\/]/).pop() ?? "")
		.toLowerCase()
		.replace(/\.exe$/, "");
	for (const family of ["claude", "codex", "agy"] as const) {
		if (config.presetId === family || executable === family) return family;
	}
	return null;
}

/**
 * Trust-store file for one agent config, mirroring launch-time resolution:
 * per-agent env wins over the host-default account selection
 * (`{...accountEnv, ...config.env}` in buildTerminalAgentLaunch, and the
 * agent wrapper's pointer-file fallback reads the same DB-backed selection).
 * Claude keeps state inside a custom CLAUDE_CONFIG_DIR but next door at
 * `~/.claude.json` for the default home; Codex always uses
 * `$CODEX_HOME/config.toml`.
 */
function resolveTrustTarget(
	db: HostDb,
	config: { presetId: string; command: string; env: Record<string, string> },
): TrustTarget | null {
	const family = resolveTrustFamily(config);
	if (family === null) return null;
	if (family === "agy") {
		return {
			family,
			file: join(homedir(), ".gemini", "antigravity-cli", "settings.json"),
		};
	}
	const env = { ...resolveDefaultAccountEnv(db, family), ...config.env };
	if (family === "claude") {
		const configDir = env.CLAUDE_CONFIG_DIR;
		return {
			family,
			file: configDir
				? join(configDir, ".claude.json")
				: join(homedir(), ".claude.json"),
		};
	}
	const codexHome = env.CODEX_HOME || join(homedir(), ".codex");
	return { family, file: join(codexHome, "config.toml") };
}

/**
 * Same-directory tmp write + rename, so a crash never truncates the store.
 * The replacement keeps the store's existing mode — these files can sit next
 * to credentials, so a user-tightened mode must survive the rewrite — and a
 * brand-new store starts owner-only. `~/.codex/config.toml` is one of the
 * files people most often symlink into a dotfiles repo, and rename would
 * replace the link, so the write follows it to the same target agent-setup's
 * writeFileIfChanged resolves.
 */
async function atomicWrite(file: string, content: string): Promise<void> {
	const target = resolveWriteTarget(file);
	const mode = await stat(target).then(
		(info) => info.mode & 0o777,
		() => 0o600,
	);
	const tmpDir = await mkdtemp(join(dirname(target), ".superset-trust-"));
	const tmpFile = join(tmpDir, "next");
	try {
		await writeFile(tmpFile, content);
		await chmod(tmpFile, mode);
		await rename(tmpFile, target);
	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}
}

/**
 * Merge `projects[<path>].hasTrustDialogAccepted: true` into a Claude state
 * file, preserving every other key. A corrupt file throws instead of being
 * clobbered. No-op when the entry is already trusted.
 */
export async function seedClaudeFolderTrust(
	stateFile: string,
	folderPath: string,
): Promise<void> {
	let state: Record<string, unknown> = {};
	if (existsSync(stateFile)) {
		state = JSON.parse(await readFile(stateFile, "utf-8"));
	} else if (!existsSync(dirname(stateFile))) {
		// A missing config dir means this login was never set up — the CLI's
		// own onboarding (which includes trust) will run anyway.
		return;
	}
	const projects = (state.projects ?? {}) as Record<
		string,
		Record<string, unknown> | undefined
	>;
	// `false` is Claude's default scaffold value ("dialog never accepted"),
	// not a recorded decline — the CLI persists no decline state (declining
	// just exits). So overwriting false → true is the intended seed, unlike
	// Codex's explicit "untrusted", which is preserved below.
	const existing = projects[folderPath];
	if (existing?.hasTrustDialogAccepted === true) return;
	state.projects = {
		...projects,
		[folderPath]: { ...existing, hasTrustDialogAccepted: true },
	};
	await atomicWrite(stateFile, JSON.stringify(state, null, 2));
}

/**
 * True when the config already defines a `projects` entry for `folderPath`,
 * tolerating header spacing and both TOML string styles (plus top-level
 * dotted keys). Appending a duplicate table would make the whole file
 * unparseable for Codex, so detection must be broader than the exact header
 * Codex itself writes.
 */
function codexProjectEntryExists(content: string, folderPath: string): boolean {
	const entry =
		/^\s*\[?\s*projects\s*\.\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*[\].]/;
	for (const line of content.split(/\r?\n/)) {
		const match = entry.exec(line);
		if (!match) continue;
		const key =
			match[1] !== undefined ? match[1].replace(/\\(["\\])/g, "$1") : match[2];
		if (key === folderPath) return true;
	}
	return false;
}

/**
 * Where a `trust_level` line for an existing entry of `folderPath` goes, or
 * null when the entry already sets one. A revoke can leave the entry with
 * other keys but no level.
 */
function codexTrustInsertion(
	lines: string[],
	folderPath: string,
): { index: number; dotted: boolean } | null {
	let table: "top" | "match" | "other" = "top";
	let header: number | undefined;
	let firstTable: number | undefined;
	let dottedEntry = false;
	for (const [index, line] of lines.entries()) {
		const projectHeader = CODEX_PROJECT_HEADER.exec(line);
		if (projectHeader || /^\s*\[/.test(line)) {
			firstTable ??= index;
			const key = projectHeader ? codexKey(projectHeader) : undefined;
			table = key === folderPath ? "match" : "other";
			if (table === "match") header = index;
			continue;
		}
		if (table === "match" && CODEX_ANY_LEVEL.test(line)) return null;
		if (table !== "top") continue;
		const dotted = CODEX_DOTTED_ENTRY.exec(line);
		if (!dotted || codexKey(dotted) !== folderPath) continue;
		if (CODEX_DOTTED_ANY_LEVEL.test(line)) return null;
		dottedEntry = true;
	}
	if (header !== undefined) return { index: header + 1, dotted: false };
	if (dottedEntry) return { index: firstTable ?? lines.length, dotted: true };
	return { index: -1, dotted: false };
}

/**
 * Append a `[projects."<path>"]` table with `trust_level = "trusted"` to a
 * Codex config.toml, or add the line to an entry for the path that has no
 * level. An existing level is left untouched — a user's explicit
 * "untrusted" must not be overridden.
 */
export async function seedCodexFolderTrust(
	configFile: string,
	folderPath: string,
): Promise<void> {
	let content = "";
	const escaped = folderPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	if (existsSync(configFile)) {
		content = await readFile(configFile, "utf-8");
		if (codexProjectEntryExists(content, folderPath)) {
			const lines = content.split("\n");
			const insertion = codexTrustInsertion(lines, folderPath);
			if (!insertion) return;
			if (insertion.index >= 0) {
				lines.splice(
					insertion.index,
					0,
					insertion.dotted
						? `projects."${escaped}".trust_level = "trusted"`
						: 'trust_level = "trusted"',
				);
				await atomicWrite(configFile, lines.join("\n"));
				return;
			}
		}
	} else if (!existsSync(dirname(configFile))) {
		return;
	}
	const block = `[projects."${escaped}"]\ntrust_level = "trusted"\n`;
	const next =
		content.length === 0 ? block : `${content.replace(/\n*$/, "\n\n")}${block}`;
	await atomicWrite(configFile, next);
}

/**
 * Append `folderPath` to `trustedWorkspaces` in Antigravity's settings.json,
 * preserving every other key. A corrupt file throws instead of being
 * clobbered. No-op when the folder is already listed.
 */
export async function seedAgyFolderTrust(
	settingsFile: string,
	folderPath: string,
): Promise<void> {
	let settings: Record<string, unknown> = {};
	if (existsSync(settingsFile)) {
		settings = JSON.parse(await readFile(settingsFile, "utf-8"));
	} else if (!existsSync(dirname(settingsFile))) {
		return;
	}
	const trusted = Array.isArray(settings.trustedWorkspaces)
		? settings.trustedWorkspaces
		: [];
	if (trusted.includes(folderPath)) return;
	settings.trustedWorkspaces = [...trusted, folderPath];
	await atomicWrite(settingsFile, JSON.stringify(settings, null, 2));
}

async function readOptional(file: string): Promise<string | null> {
	return existsSync(file) ? readFile(file, "utf-8") : null;
}

/** Claude also honours trust accepted on an ancestor folder. */
export async function isClaudeFolderTrusted(
	stateFile: string,
	folderPaths: string[],
): Promise<boolean> {
	const content = await readOptional(stateFile);
	if (content === null) return false;
	const projectsByPath = (JSON.parse(content).projects ?? {}) as Record<
		string,
		{ hasTrustDialogAccepted?: unknown } | undefined
	>;
	return folderPaths.some((folderPath) => {
		for (let path = folderPath; ; path = dirname(path)) {
			if (projectsByPath[path]?.hasTrustDialogAccepted === true) return true;
			if (dirname(path) === path) return false;
		}
	});
}

const CODEX_STRING_KEY = String.raw`(?:"((?:[^"\\]|\\.)*)"|'([^']*)')`;
const CODEX_PROJECT_HEADER = new RegExp(
	String.raw`^\s*\[\s*projects\s*\.\s*${CODEX_STRING_KEY}\s*\]\s*(?:#.*)?$`,
);
const CODEX_DOTTED_TRUST = new RegExp(
	String.raw`^\s*projects\s*\.\s*${CODEX_STRING_KEY}\s*\.\s*trust_level\s*=\s*["']trusted["']`,
);
const CODEX_TRUST_LINE = /^\s*trust_level\s*=\s*["']trusted["']/;
const CODEX_ANY_LEVEL = /^\s*trust_level\s*=/;
const CODEX_DOTTED_ENTRY = new RegExp(
	String.raw`^\s*projects\s*\.\s*${CODEX_STRING_KEY}\s*\.`,
);
const CODEX_DOTTED_ANY_LEVEL = new RegExp(
	String.raw`^\s*projects\s*\.\s*${CODEX_STRING_KEY}\s*\.\s*trust_level\s*=`,
);

function codexKey(match: RegExpExecArray): string | undefined {
	return match[1] !== undefined
		? match[1].replace(/\\(["\\])/g, "$1")
		: match[2];
}

export async function isCodexFolderTrusted(
	configFile: string,
	folderPaths: string[],
): Promise<boolean> {
	const content = await readOptional(configFile);
	if (content === null) return false;
	let table: "top" | "match" | "other" = "top";
	for (const line of content.split(/\r?\n/)) {
		const header = CODEX_PROJECT_HEADER.exec(line);
		if (header) {
			const key = codexKey(header);
			table =
				key !== undefined && folderPaths.includes(key) ? "match" : "other";
			continue;
		}
		if (/^\s*\[/.test(line)) {
			table = "other";
			continue;
		}
		if (table === "match" && CODEX_TRUST_LINE.test(line)) return true;
		const dotted = table === "top" ? CODEX_DOTTED_TRUST.exec(line) : null;
		const dottedKey = dotted ? codexKey(dotted) : undefined;
		if (dottedKey !== undefined && folderPaths.includes(dottedKey)) {
			return true;
		}
	}
	return false;
}

export async function isAgyFolderTrusted(
	settingsFile: string,
	folderPaths: string[],
): Promise<boolean> {
	const content = await readOptional(settingsFile);
	if (content === null) return false;
	const trusted = JSON.parse(content).trustedWorkspaces;
	return (
		Array.isArray(trusted) &&
		folderPaths.some((folderPath) => trusted.includes(folderPath))
	);
}

function isFolderTrusted(
	target: TrustTarget,
	folderPath: string,
): Promise<boolean> {
	const candidates = [
		...new Set([resolve(folderPath), normalizeFolderPath(folderPath)]),
	];
	if (target.family === "claude") {
		return isClaudeFolderTrusted(target.file, candidates);
	}
	if (target.family === "agy") {
		return isAgyFolderTrusted(target.file, candidates);
	}
	return isCodexFolderTrusted(target.file, candidates);
}

function normalizeFolderPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/**
 * Seed trust for `folderPath` in the launching agent's trust store, if it
 * has a known one. `config` is the already-resolved host agent config of the
 * agent about to launch. With `requireTrustedPath`, the seed happens only
 * when that folder is already trusted in the same store. Best-effort:
 * failures log and the dialog shows once.
 */
export async function seedAgentFolderTrust(
	db: HostDb,
	folderPath: string,
	config: { presetId: string; command: string; env: Record<string, string> },
	requireTrustedPath?: string,
): Promise<void> {
	try {
		const target = resolveTrustTarget(db, config);
		if (target === null) return;
		if (
			requireTrustedPath !== undefined &&
			!(await isFolderTrusted(target, requireTrustedPath))
		) {
			return;
		}
		const normalized = normalizeFolderPath(folderPath);
		if (target.family === "claude") {
			await seedClaudeFolderTrust(target.file, normalized);
		} else if (target.family === "agy") {
			await seedAgyFolderTrust(target.file, normalized);
		} else {
			await seedCodexFolderTrust(target.file, normalized);
		}
	} catch (err) {
		console.warn(
			`[agents.run] failed to pre-trust session folder '${folderPath}' for agent '${config.presetId}':`,
			err,
		);
	}
}

/**
 * Session folders and multi-repo roots are not inside a trusted repository,
 * so the agent about to launch there gets them pre-trusted: a session folder
 * always, a multi-repo root only when the repository whose agent config it
 * links is already trusted. A worktree of a single repository inherits trust
 * from the main checkout.
 */
export async function seedWorkspaceFolderTrust(
	db: HostDb,
	workspaceId: string,
	agent: string,
): Promise<void> {
	const workspace = db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace) return;
	let configRepositoryPath: string | undefined;
	if (workspace.projectId !== null) {
		const checkouts = listWorkspaceCheckouts(db, workspace);
		if (checkouts.length < 2) return;
		const source = configSourceCheckout(
			checkouts,
			primaryRepositoryIdOf(db, workspace.projectId),
		);
		if (!source) return;
		configRepositoryPath = source.repository.repoPath;
	}
	const config = resolveHostAgentConfig(db, agent);
	if (config) {
		await seedAgentFolderTrust(
			db,
			workspace.worktreePath,
			config,
			configRepositoryPath,
		);
	}
}

function primaryRepositoryIdOf(db: HostDb, projectId: string): string | null {
	return (
		db
			.select({ primaryRepositoryId: projects.primaryRepositoryId })
			.from(projects)
			.where(eq(projects.id, projectId))
			.get()?.primaryRepositoryId ?? null
	);
}

/** Clears `hasTrustDialogAccepted` on the folder's own entries only. */
export async function revokeClaudeFolderTrust(
	stateFile: string,
	folderPaths: string[],
): Promise<void> {
	const content = await readOptional(stateFile);
	if (content === null) return;
	const state = JSON.parse(content);
	const projectsByPath = (state.projects ?? {}) as Record<
		string,
		Record<string, unknown> | undefined
	>;
	const revoked = folderPaths.filter(
		(path) => projectsByPath[path]?.hasTrustDialogAccepted === true,
	);
	if (revoked.length === 0) return;
	state.projects = {
		...projectsByPath,
		...Object.fromEntries(
			revoked.map((path) => [
				path,
				{ ...projectsByPath[path], hasTrustDialogAccepted: false },
			]),
		),
	};
	await atomicWrite(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Drops the folder's `trust_level = "trusted"` lines, and its table header
 * when nothing else is left in that table. Every other line stays as written.
 */
export async function revokeCodexFolderTrust(
	configFile: string,
	folderPaths: string[],
): Promise<void> {
	const content = await readOptional(configFile);
	if (content === null) return;
	const lines = content.split("\n");
	const kept: string[] = [];
	let table: "top" | "match" | "other" = "top";
	let matchHeader: number | undefined;
	let removedFromTable = false;
	const dropEmptyMatchHeader = () => {
		if (
			matchHeader !== undefined &&
			removedFromTable &&
			kept.slice(matchHeader + 1).every((line) => line.trim() === "")
		) {
			kept.length = matchHeader;
			while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") {
				kept.pop();
			}
			if (kept.length > 0) kept.push("");
		}
		matchHeader = undefined;
		removedFromTable = false;
	};
	let changed = false;
	for (const line of lines) {
		const header = CODEX_PROJECT_HEADER.exec(line);
		if (header || /^\s*\[/.test(line)) {
			dropEmptyMatchHeader();
			const key = header ? codexKey(header) : undefined;
			table =
				key !== undefined && folderPaths.includes(key) ? "match" : "other";
			if (table === "match") matchHeader = kept.length;
			kept.push(line);
			continue;
		}
		if (table === "match" && CODEX_TRUST_LINE.test(line)) {
			changed = true;
			removedFromTable = true;
			continue;
		}
		const dotted = table === "top" ? CODEX_DOTTED_TRUST.exec(line) : null;
		const dottedKey = dotted ? codexKey(dotted) : undefined;
		if (dottedKey !== undefined && folderPaths.includes(dottedKey)) {
			changed = true;
			continue;
		}
		kept.push(line);
	}
	dropEmptyMatchHeader();
	if (!changed) return;
	const next = kept.join("\n").replace(/\n*$/, "\n");
	await atomicWrite(configFile, next.trim() === "" ? "" : next);
}

export async function revokeAgyFolderTrust(
	settingsFile: string,
	folderPaths: string[],
): Promise<void> {
	const content = await readOptional(settingsFile);
	if (content === null) return;
	const settings = JSON.parse(content);
	const trusted = settings.trustedWorkspaces;
	if (!Array.isArray(trusted)) return;
	const next = trusted.filter((path) => !folderPaths.includes(path));
	if (next.length === trusted.length) return;
	settings.trustedWorkspaces = next;
	await atomicWrite(settingsFile, JSON.stringify(settings, null, 2));
}

function revokeFolderTrust(
	target: TrustTarget,
	folderPath: string,
): Promise<void> {
	const candidates = [
		...new Set([resolve(folderPath), normalizeFolderPath(folderPath)]),
	];
	if (target.family === "claude") {
		return revokeClaudeFolderTrust(target.file, candidates);
	}
	if (target.family === "agy") {
		return revokeAgyFolderTrust(target.file, candidates);
	}
	return revokeCodexFolderTrust(target.file, candidates);
}

/**
 * After a primary change, a multi-repo root whose agent config now comes
 * from another repository loses its trust in every store that does not
 * trust that repository. Best-effort, like the seed.
 */
export async function revokeRootTrustForNewPrimary(
	db: HostDb,
	projectId: string,
	previousPrimaryRepositoryId: string | null,
): Promise<void> {
	const primaryRepositoryId = primaryRepositoryIdOf(db, projectId);
	const moved: { root: string; sourcePath: string }[] = [];
	for (const workspace of db
		.select()
		.from(workspaces)
		.where(eq(workspaces.projectId, projectId))
		.all()) {
		const checkouts = listWorkspaceCheckouts(db, workspace);
		if (checkouts.length < 2) continue;
		const before = configSourceCheckout(checkouts, previousPrimaryRepositoryId);
		const after = configSourceCheckout(checkouts, primaryRepositoryId);
		if (!after || before?.repository.id === after.repository.id) continue;
		moved.push({
			root: workspace.worktreePath,
			sourcePath: after.repository.repoPath,
		});
	}
	if (moved.length === 0) return;
	const targets = new Map<string, TrustTarget>();
	for (const row of db.select().from(hostAgentConfigs).all()) {
		const target = resolveTrustTarget(db, rowToConfig(row));
		if (target) targets.set(`${target.family}:${target.file}`, target);
	}
	for (const target of targets.values()) {
		try {
			for (const { root, sourcePath } of moved) {
				if (!(await isFolderTrusted(target, sourcePath))) {
					await revokeFolderTrust(target, root);
				}
			}
		} catch (err) {
			console.warn(
				`[project.setPrimaryRepository] failed to revoke root trust in '${target.file}':`,
				err,
			);
		}
	}
}
