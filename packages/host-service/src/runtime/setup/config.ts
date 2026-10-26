import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	type ConfigError,
	fromV1Json,
	type ResolvedPhase,
	type ResolvedProjectConfig,
	resolveProjectConfig,
} from "@superset/shared/project-config";
import {
	configEnvironment,
	findTomlConfigPath,
	formatConfigErrors,
	loadTomlConfig,
} from "./project-config-toml";

const PROJECT_SUPERSET_DIR_NAME = ".superset";
const CONFIG_FILE_NAME = "config.json";
const LOCAL_CONFIG_FILE_NAME = "config.local.json";
const SUPERSET_DIR_NAME = ".superset";
const PROJECTS_DIR_NAME = "projects";

export interface SetupConfig {
	setup?: string[];
	teardown?: string[];
	run?: string[];
	/** Services a cloud workspace needs on every boot; runs once host-service is up. */
	start?: string[];
	cwd?: string;
}

interface LocalScriptMerge {
	before?: string[];
	after?: string[];
}

interface LocalSetupConfig {
	setup?: string[] | LocalScriptMerge;
	teardown?: string[] | LocalScriptMerge;
	run?: string[] | LocalScriptMerge;
	start?: string[] | LocalScriptMerge;
}

const SCRIPT_KEYS = ["setup", "teardown", "run", "start"] as const;
export type ScriptKey = (typeof SCRIPT_KEYS)[number];

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function readJson<T>(filePath: string): T | null {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, "utf-8")) as T;
	} catch (error) {
		console.error(
			`Failed to read JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function validateSetupConfig(
	parsed: unknown,
	source: string,
): SetupConfig | null {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const obj = parsed as Record<string, unknown>;
	const result: SetupConfig = {};
	if (obj.cwd !== undefined) {
		if (typeof obj.cwd !== "string" || obj.cwd.trim().length === 0) {
			console.error(
				`Invalid setup config at ${source}: 'cwd' must be a non-empty string`,
			);
			return null;
		}
		result.cwd = obj.cwd.trim();
	}
	for (const key of SCRIPT_KEYS) {
		const value = obj[key];
		if (value === undefined) continue;
		if (!isStringArray(value)) {
			console.error(
				`Invalid setup config at ${source}: '${key}' must be an array of strings`,
			);
			return null;
		}
		result[key] = value;
	}
	return result;
}

function readSetupConfigAt(filePath: string): SetupConfig | null {
	const parsed = readJson<unknown>(filePath);
	if (parsed === null) return null;
	return validateSetupConfig(parsed, filePath);
}

function readLocalConfigAt(filePath: string): LocalSetupConfig | null {
	const parsed = readJson<unknown>(filePath);
	if (parsed === null) return null;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const obj = parsed as Record<string, unknown>;
	const result: LocalSetupConfig = {};
	for (const key of SCRIPT_KEYS) {
		const value = obj[key];
		if (value === undefined) continue;
		if (isStringArray(value)) {
			result[key] = value;
			continue;
		}
		if (value && typeof value === "object" && !Array.isArray(value)) {
			const merge = value as Record<string, unknown>;
			if (merge.before !== undefined && !isStringArray(merge.before)) {
				console.error(
					`Invalid local config at ${filePath}: '${key}.before' must be an array of strings`,
				);
				return null;
			}
			if (merge.after !== undefined && !isStringArray(merge.after)) {
				console.error(
					`Invalid local config at ${filePath}: '${key}.after' must be an array of strings`,
				);
				return null;
			}
			result[key] = {
				before: merge.before as string[] | undefined,
				after: merge.after as string[] | undefined,
			};
			continue;
		}
		console.error(
			`Invalid local config at ${filePath}: '${key}' must be an array or {before,after}`,
		);
		return null;
	}
	return result;
}

function mergeBaseConfigs(
	base: SetupConfig | null,
	override: SetupConfig | null,
): SetupConfig | null {
	if (!base) return override;
	if (!override) return base;
	return {
		setup: override.setup ?? base.setup,
		teardown: override.teardown ?? base.teardown,
		run: override.run ?? base.run,
		start: override.start ?? base.start,
		cwd: override.cwd ?? base.cwd,
	};
}

function applyLocalOverlay(
	base: SetupConfig,
	local: LocalSetupConfig,
): SetupConfig {
	const result: SetupConfig = { ...base };
	for (const key of SCRIPT_KEYS) {
		const localValue = local[key];
		if (localValue === undefined) continue;
		if (Array.isArray(localValue)) {
			result[key] = localValue;
		} else {
			const before = localValue.before ?? [];
			const after = localValue.after ?? [];
			result[key] = [...before, ...(base[key] ?? []), ...after];
		}
	}
	return result;
}

export function getProjectConfigPath(repoPath: string): string {
	return join(repoPath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME);
}

/**
 * Candidate user-override files, highest priority first: keyed by the
 * project's repo path mirrored under the projects dir (e.g.
 * `~/.superset/projects/Users/me/work/app/config.json` — discoverable
 * without looking up an ID), then by project id (legacy). The first
 * candidate that parses wins.
 */
function getUserOverridePaths(args: {
	repoPath: string;
	projectId: string;
	homeDir: string;
}): string[] {
	const projectsDir = join(args.homeDir, SUPERSET_DIR_NAME, PROJECTS_DIR_NAME);
	const paths = [join(projectsDir, args.repoPath, CONFIG_FILE_NAME)];
	if (!args.projectId.includes("/") && !args.projectId.includes("\\")) {
		paths.push(join(projectsDir, args.projectId, CONFIG_FILE_NAME));
	}
	return paths;
}

function getLocalOverlayPath(repoPath: string): string {
	return join(repoPath, PROJECT_SUPERSET_DIR_NAME, LOCAL_CONFIG_FILE_NAME);
}

/**
 * Resolve setup/teardown/run config for a v2 project. Base merge, per key,
 * later wins:
 *
 *   1. <repoPath>/.superset/config.json      — canonical project config
 *   2. <worktreePath>/.superset/config.json  — workspace/branch override
 *      (only when a worktree is in scope: setup at create, teardown at delete)
 *   3. ~/.superset/projects/<repoPath>/config.json — per-machine user
 *      override (falls back to the legacy <project-id> key)
 *
 * Then a local overlay with before/after/replace semantics: the worktree's
 * `config.local.json` if present, else the main repo's.
 *
 * Returns null when no source defines anything.
 */
export function loadSetupConfig(args: {
	repoPath: string;
	projectId: string;
	/** Workspace worktree; when set, its config overrides the main repo's. */
	worktreePath?: string;
	/** Override $HOME for tests. Defaults to `os.homedir()`. */
	homeDir?: string;
}): SetupConfig | null {
	const projectConfig = readSetupConfigAt(getProjectConfigPath(args.repoPath));
	const worktreeConfig = args.worktreePath
		? readSetupConfigAt(getProjectConfigPath(args.worktreePath))
		: null;

	let userConfig: SetupConfig | null = null;
	for (const overridePath of getUserOverridePaths({
		repoPath: args.repoPath,
		projectId: args.projectId,
		homeDir: args.homeDir ?? homedir(),
	})) {
		userConfig = readSetupConfigAt(overridePath);
		if (userConfig) break;
	}

	const base = mergeBaseConfigs(
		mergeBaseConfigs(projectConfig, worktreeConfig),
		userConfig,
	);
	if (!base) return null;

	const worktreeLocal = args.worktreePath
		? readLocalConfigAt(getLocalOverlayPath(args.worktreePath))
		: null;
	const local =
		worktreeLocal ?? readLocalConfigAt(getLocalOverlayPath(args.repoPath));
	return local ? applyLocalOverlay(base, local) : base;
}

function nonEmptyStrings(value: string[] | undefined): string[] {
	return (value ?? []).filter((s) => s.trim().length > 0);
}

export function hasConfiguredScripts(config: SetupConfig | null): boolean {
	if (!config) return false;
	for (const key of SCRIPT_KEYS satisfies readonly ScriptKey[]) {
		if (nonEmptyStrings(config[key]).length > 0) return true;
	}
	return false;
}

export type ProjectConfigLoad =
	| { kind: "ok"; format: "toml" | "json"; resolved: ResolvedProjectConfig }
	| { kind: "invalid"; path: string; errors: ConfigError[] };

/**
 * The project's config in the config.toml model. A project still on v1 is read
 * through its conversion, so every caller sees one shape. Worktree files win
 * over the main repo's when `worktreePath` is in scope. Null when nothing is
 * configured.
 */
export function loadProjectConfig(args: {
	repoPath: string;
	projectId: string;
	worktreePath?: string;
	/** Override $HOME for tests. Defaults to `os.homedir()`. */
	homeDir?: string;
}): ProjectConfigLoad | null {
	const toml = loadTomlConfig(args);
	if (toml?.kind === "invalid") return toml;
	if (toml) return { kind: "ok", format: "toml", resolved: toml.resolved };

	const v1 = withScriptFallbacks(loadSetupConfig(args) ?? {}, args);
	if (!hasConfiguredScripts(v1)) return null;
	return {
		kind: "ok",
		format: "json",
		resolved: resolveProjectConfig({
			base: fromV1Json(v1),
			local: null,
			environment: configEnvironment(),
		}),
	};
}

/** v1 runs `.superset/<key>.sh` for a key with no commands, worktree first. */
function withScriptFallbacks(
	config: SetupConfig,
	args: { repoPath: string; worktreePath?: string },
): SetupConfig {
	const roots = args.worktreePath
		? [args.worktreePath, args.repoPath]
		: [args.repoPath];
	const result = { ...config };
	for (const key of SCRIPT_KEYS) {
		if (nonEmptyStrings(config[key]).length > 0) continue;
		const script = roots
			.map((root) => join(root, PROJECT_SUPERSET_DIR_NAME, `${key}.sh`))
			.find((path) => existsSync(path));
		if (script) result[key] = [`bash ${shellSingleQuote(script)}`];
	}
	return result;
}

export interface PhaseCommand {
	command: string;
	cwd?: string;
}

/**
 * Phases as one `&&` chain. When they name different directories, each
 * command enters its own, resolved against `root`.
 */
export function chainPhases(
	phases: ResolvedPhase[],
	root: string,
): PhaseCommand | null {
	const active = phases.filter((phase) => phase.commands.length > 0);
	if (active.length === 0) return null;
	const cwds = new Set(active.map((phase) => phase.cwd));
	if (cwds.size === 1) {
		const cwd = active[0]?.cwd;
		return {
			command: active.flatMap((phase) => phase.commands).join(" && "),
			...(cwd && { cwd }),
		};
	}
	return {
		command: active
			.flatMap((phase) => {
				const dir = shellSingleQuote(resolve(root, phase.cwd ?? "."));
				return phase.commands.map((command) => `(cd ${dir} && ${command})`);
			})
			.join(" && "),
	};
}

/** A command that prints why the config is invalid, then fails. */
export function invalidConfigCommand(
	config: Extract<ProjectConfigLoad, { kind: "invalid" }>,
): string {
	const lines = formatConfigErrors(config);
	console.error(lines.join("\n"));
	return `printf '%s\\n' ${lines.map(shellSingleQuote).join(" ")} >&2 && false`;
}

/** Whether any config source exists, for the sidebar's "set up scripts" card. */
export function hasProjectConfig(args: {
	repoPath: string;
	projectId: string;
	homeDir?: string;
}): boolean {
	if (findTomlConfigPath(args)) return true;
	return hasConfiguredScripts(loadSetupConfig(args));
}

export type LegacyConfigSource =
	| "config_json"
	| "config_local_json"
	| "before_after"
	| "user_projects_override"
	| "script_fallback"
	| "cloud_start";

/**
 * Which config format a workspace uses and which v1 features it still relies
 * on, for usage reporting. Never reads command contents into the result.
 */
export function describeProjectConfigSources(args: {
	repoPath: string;
	projectId: string;
	worktreePath?: string;
	homeDir?: string;
}): { format: "toml" | "json" | "none"; legacySources: LegacyConfigSource[] } {
	if (findTomlConfigPath(args)) return { format: "toml", legacySources: [] };

	const sources = new Set<LegacyConfigSource>();
	const roots = args.worktreePath
		? [args.worktreePath, args.repoPath]
		: [args.repoPath];
	const projectJsons = roots
		.map((root) => readSetupConfigAt(getProjectConfigPath(root)))
		.filter((config): config is SetupConfig => config !== null);
	if (projectJsons.length > 0) sources.add("config_json");
	if (projectJsons.some((config) => config.start?.length)) {
		sources.add("cloud_start");
	}
	for (const root of roots) {
		const local = readJson<Record<string, unknown>>(getLocalOverlayPath(root));
		if (!local) continue;
		sources.add("config_local_json");
		if (
			Object.values(local).some(
				(value) => value && typeof value === "object" && !Array.isArray(value),
			)
		) {
			sources.add("before_after");
		}
	}
	const homeDir = args.homeDir ?? homedir();
	if (
		getUserOverridePaths({ ...args, homeDir }).some((path) => existsSync(path))
	) {
		sources.add("user_projects_override");
	}
	const config = loadSetupConfig(args);
	for (const key of ["setup", "teardown", "run"] as const) {
		if (nonEmptyStrings(config?.[key]).length > 0) continue;
		if (
			roots.some((root) =>
				existsSync(join(root, PROJECT_SUPERSET_DIR_NAME, `${key}.sh`)),
			)
		) {
			sources.add("script_fallback");
		}
	}
	return {
		format: sources.size > 0 ? "json" : "none",
		legacySources: [...sources],
	};
}

/** POSIX single-quote escape: safe for any byte sequence in a path. */
export function shellSingleQuote(s: string): string {
	return `'${s.replaceAll("'", "'\\''")}'`;
}
