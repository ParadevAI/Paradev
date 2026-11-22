import fs from "node:fs";
import path from "node:path";
import {
	buildDefaultAccountResolver,
	buildWrapperScript,
	createWrapper,
	DYNAMIC_NOTIFY_PATH_MARKER,
	getManagedArtifactGuardHookCommand,
	getManagedNotifyHookCommand,
	isManagedArtifactGuardCommand,
	isManagedNotifyCommand,
	removeOwnedFileIfMarked,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getArtifactGuardScriptPath } from "./artifact-guard-hook";
import { getTemplatePath } from "./config";
import {
	buildNestedDesiredEntries,
	cleanNestedHookDefinition,
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { getNotifyScriptPath } from "./notify-hook";
import {
	getHooksDir,
	getOpenCodeConfigDir,
	getOpenCodePluginDir,
	getOpenCodeTuiPluginDir,
	resolveUserHomeDir,
} from "./paths";

export const OPENCODE_PLUGIN_FILE = "superset-notify.js";

const OPENCODE_PLUGIN_SIGNATURE = "// Superset opencode plugin";
const OPENCODE_PLUGIN_VERSION = "v11";
export const OPENCODE_PLUGIN_MARKER = `${OPENCODE_PLUGIN_SIGNATURE} ${OPENCODE_PLUGIN_VERSION}`;
const OPENCODE_TUI_PLUGIN_SIGNATURE = "// Superset opencode tui plugin";
export const OPENCODE_TUI_PLUGIN_MARKER = `${OPENCODE_TUI_PLUGIN_SIGNATURE} v2`;

/**
 * Returns the environment-scoped OpenCode plugin path under Superset home.
 */
export function getOpenCodePluginPath(): string {
	return path.join(getOpenCodePluginDir(), OPENCODE_PLUGIN_FILE);
}

export function getOpenCodeTuiPluginPath(): string {
	return path.join(getOpenCodeTuiPluginDir(), "tui.js");
}

/** @see https://opencode.ai/docs/plugins */
export function getOpenCodeGlobalPluginPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(resolveUserHomeDir(), ".config");
	return path.join(configHome, "opencode", "plugin", OPENCODE_PLUGIN_FILE);
}

// ---------------------------------------------------------------------------
// Claude ~/.claude/settings.json direct merge (no wrapper needed)
// ---------------------------------------------------------------------------

interface ClaudeHookDefinition {
	matcher?: string;
	hooks?: Array<{ type: "command"; command: string; [key: string]: unknown }>;
	[key: string]: unknown;
}

/** Shell command written into Claude's global hook config. */
export function getClaudeManagedHookCommand(): string {
	return getManagedNotifyHookCommand("claude");
}

export const CLAUDE_ARTIFACT_GUARD_EVENT = "PreToolUse";
export const CLAUDE_ARTIFACT_GUARD_MATCHER = "Artifact";
export const CLAUDE_MANAGED_SETTINGS_FILE = "claude-settings.json";

/**
 * Returns the global Claude settings path used for native hook registration.
 */
export function getClaudeGlobalSettingsJsonPath(): string {
	return path.join(resolveUserHomeDir(), ".claude", "settings.json");
}

/** Hooks-only Claude settings file owned by Paradev under `$SUPERSET_HOME_DIR/hooks/`. */
export function getClaudeManagedSettingsJsonPath(): string {
	return path.join(getHooksDir(), CLAUDE_MANAGED_SETTINGS_FILE);
}

// StopFailure is the API-error hook; it fires while the session stays alive,
// unlike Stop. SubagentStart/SubagentStop feed the per-terminal subagent
// roster; the notify script routes them by their agent_id, never as the
// terminal's own lifecycle.
const CLAUDE_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	SessionEnd: {},
	UserPromptSubmit: {},
	Stop: {},
	StopFailure: {},
	SubagentStart: {},
	SubagentStop: {},
	PostToolUse: { matcher: "*" },
	PostToolUseFailure: { matcher: "*" },
	PermissionRequest: { matcher: "*" },
};

function buildClaudeManagedHooks(): Record<string, ClaudeHookDefinition[]> {
	const desiredEntriesByEvent = buildNestedDesiredEntries<ClaudeHookDefinition>(
		CLAUDE_MANAGED_EVENTS,
		getClaudeManagedHookCommand(),
	);
	desiredEntriesByEvent[CLAUDE_ARTIFACT_GUARD_EVENT] = [
		...(desiredEntriesByEvent[CLAUDE_ARTIFACT_GUARD_EVENT] ?? []),
		{
			matcher: CLAUDE_ARTIFACT_GUARD_MATCHER,
			hooks: [
				{ type: "command", command: getManagedArtifactGuardHookCommand() },
			],
		},
	];
	return desiredEntriesByEvent;
}

function claudeHooksSpec(
	notifyScriptPath: string,
	artifactGuardScriptPath: string = getArtifactGuardScriptPath(),
): ManagedJsonHooksSpec<ClaudeHookDefinition> {
	return {
		fileLabel: "Claude settings.json",
		agentLabel: "Claude",
		getFilePath: getClaudeGlobalSettingsJsonPath,
		eventsContainerKey: "hooks",
		desiredEntriesByEvent: buildClaudeManagedHooks(),
		cleanEntry: (definition) =>
			cleanNestedHookDefinition(
				definition,
				(command) =>
					isManagedNotifyCommand(command, notifyScriptPath) ||
					isManagedArtifactGuardCommand(command, artifactGuardScriptPath),
			),
		dropEmptyContainerOnRemove: true,
	};
}

export function getClaudeManagedSettingsJsonContent(): string {
	return `${JSON.stringify({ hooks: buildClaudeManagedHooks() }, null, 2)}\n`;
}

export function createClaudeManagedSettingsJson(): void {
	const filePath = getClaudeManagedSettingsJsonPath();
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const changed = writeFileIfChanged(
		filePath,
		getClaudeManagedSettingsJsonContent(),
		0o644,
	);
	(changed ? console.log : console.debug)(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Claude managed settings.json`,
	);
}

/**
 * Reads existing ~/.claude/settings.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks
 * and all non-hook settings.
 *
 * Claude Code uses the same nested hook structure as Droid:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export function getClaudeGlobalSettingsJsonContent(
	notifyScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(claudeHooksSpec(notifyScriptPath));
}

/**
 * Writes Superset hook definitions directly into ~/.claude/settings.json.
 * This ensures hooks work regardless of whether the binary wrapper is in PATH,
 * matching the approach used for Cursor, Gemini, Droid, and Mastra.
 */
export function createClaudeSettingsJson(): void {
	ensureManagedJsonHooks(claudeHooksSpec(getNotifyScriptPath()));
}

/**
 * Removes Paradev-managed hooks from ~/.claude/settings.json and deletes the
 * hooks-only settings file. No-op when absent.
 */
export function removeClaudeManagedHooks(): void {
	removeManagedJsonHooks(claudeHooksSpec(getNotifyScriptPath()));
	removeOwnedFileIfMarked(
		getClaudeManagedSettingsJsonPath(),
		DYNAMIC_NOTIFY_PATH_MARKER,
		"Claude managed settings.json",
	);
}

/**
 * Merges Superset hooks into `<configDir>/settings.json` for a secondary
 * Claude profile (CLAUDE_CONFIG_DIR account). Without this, agents launched
 * on a non-default account would lose lifecycle/status hooks — Claude reads
 * settings exclusively from the active config dir.
 */
export function ensureClaudeManagedHooksAt(configDir: string): void {
	ensureManagedJsonHooks({
		...claudeHooksSpec(getNotifyScriptPath()),
		getFilePath: () => path.join(configDir, "settings.json"),
	});
}

// ---------------------------------------------------------------------------
// Codex ~/.codex/hooks.json direct merge
// ---------------------------------------------------------------------------

/**
 * Returns the global Codex hooks.json path used for fallback hook registration.
 */
export function getCodexGlobalHooksJsonPath(): string {
	return path.join(resolveUserHomeDir(), ".codex", "hooks.json");
}

// SubagentStart/SubagentStop fire for spawn_agent children (multi_agent is
// on by default); the notify script forwards them to the subagent roster.
const CODEX_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	SessionEnd: {},
	UserPromptSubmit: {},
	// A planning question blocks on user input; resume working after its answer.
	// Match only this tool so ordinary tool calls never signal a waiting state.
	PreToolUse: { matcher: "^request_user_input$" },
	// Reassert working state after any tool call so a cleared or missed Start
	// self-heals during a turn, matching Claude's lifecycle behavior.
	PostToolUse: { matcher: "*" },
	Stop: {},
	Interrupt: {},
	SubagentStart: {},
	SubagentStop: {},
};

function codexHooksSpec(
	notifyScriptPath: string,
): ManagedJsonHooksSpec<ClaudeHookDefinition> {
	return {
		fileLabel: "Codex hooks.json",
		agentLabel: "Codex",
		getFilePath: getCodexGlobalHooksJsonPath,
		eventsContainerKey: "hooks",
		// Guarded on SUPERSET_HOME_DIR so the hook is a no-op in codex sessions
		// launched outside Superset terminals. Superset terminals without the
		// PATH wrapper still export SUPERSET_HOME_DIR, so the outside-wrapper
		// fallback this file provides keeps working.
		desiredEntriesByEvent: buildNestedDesiredEntries(
			CODEX_MANAGED_EVENTS,
			getManagedNotifyHookCommand("codex"),
		),
		cleanEntry: (definition) =>
			cleanNestedHookDefinition(definition, (command) =>
				isManagedNotifyCommand(command, notifyScriptPath),
			),
		dropEmptyContainerOnRemove: true,
	};
}

/**
 * Reads existing ~/.codex/hooks.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks.
 * Stale Superset-managed commands are stripped from every event, including
 * events we no longer manage natively (e.g. from older builds).
 *
 * Codex hooks.json uses the same nested structure as Claude/Droid:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 *
 * Superset uses native Codex hooks as the durable lifecycle integration path.
 * Recent Codex builds no longer emit the older session-log shapes our wrapper
 * watcher depended on, so we register prompt/tool lifecycle hooks directly in
 * ~/.codex/hooks.json and treat the wrapper session-log watcher as best-effort
 * compatibility for older releases.
 */
export function getCodexGlobalHooksJsonContent(
	notifyScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(codexHooksSpec(notifyScriptPath));
}

/**
 * Writes Superset hook definitions directly into ~/.codex/hooks.json.
 * This provides a fallback notification path that works even when the
 * binary wrapper is not in PATH (e.g. user runs codex from outside
 * a Superset terminal).
 */
export function createCodexHooksJson(): void {
	ensureManagedJsonHooks(codexHooksSpec(getNotifyScriptPath()));
}

/**
 * Removes Superset-managed hook entries from ~/.codex/hooks.json, preserving
 * user hooks. No-op when the file does not exist.
 */
export function removeCodexManagedHooks(): void {
	removeManagedJsonHooks(codexHooksSpec(getNotifyScriptPath()));
}

/**
 * Merges Superset hooks into `<codexHome>/hooks.json` for a secondary Codex
 * home (CODEX_HOME account) — same rationale as ensureClaudeManagedHooksAt.
 */
export function ensureCodexManagedHooksAt(codexHome: string): void {
	ensureManagedJsonHooks({
		...codexHooksSpec(getNotifyScriptPath()),
		getFilePath: () => path.join(codexHome, "hooks.json"),
	});
}

// ---------------------------------------------------------------------------
// Wrappers and OpenCode plugin
// ---------------------------------------------------------------------------

/**
 * Renders the OpenCode plugin file content with the current notify script path.
 */
export function getOpenCodePluginContent(notifyPath: string): string {
	const template = fs.readFileSync(
		getTemplatePath("opencode-plugin.template.js"),
		"utf-8",
	);
	return template
		.replace("{{MARKER}}", OPENCODE_PLUGIN_MARKER)
		.replace("{{NOTIFY_PATH}}", notifyPath);
}

export function getOpenCodeTuiPluginContent(notifyPath: string): string {
	const template = fs.readFileSync(
		getTemplatePath("opencode-tui-plugin.template.js"),
		"utf-8",
	);
	return template
		.replace("{{MARKER}}", OPENCODE_TUI_PLUGIN_MARKER)
		.replace("{{NOTIFY_PATH}}", () => JSON.stringify(notifyPath));
}

// Claude's --settings is single-valued (last wins) and bypasses --setting-sources,
// so skip injection when the caller sets either (without user) or runs a subcommand.
export function buildClaudeWrapperExecLine(): string {
	return `_superset_claude_terminal_id="\${SUPERSET_TERMINAL_ID:-\${PARADEV_TERMINAL_ID:-}}"
_superset_claude_home_dir="\${SUPERSET_HOME_DIR:-\${PARADEV_HOME_DIR:-}}"
_superset_claude_settings=""

if [ -n "$_superset_claude_terminal_id" ] && [ -n "$_superset_claude_home_dir" ] \\
  && [ "$SUPERSET_AGENT_ID" = "claude" ] && [ -n "\${CLAUDE_CONFIG_DIR:-}" ]; then
  _superset_claude_config_dir="$CLAUDE_CONFIG_DIR"
  while [ "\${#_superset_claude_config_dir}" -gt 1 ] && [ "\${_superset_claude_config_dir%/}" != "$_superset_claude_config_dir" ]; do
    _superset_claude_config_dir="\${_superset_claude_config_dir%/}"
  done

  _superset_default_dir="\${SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR:-}"
  while [ "\${#_superset_default_dir}" -gt 1 ] && [ "\${_superset_default_dir%/}" != "$_superset_default_dir" ]; do
    _superset_default_dir="\${_superset_default_dir%/}"
  done

  _superset_home_claude=""
  if [ -n "\${HOME:-}" ]; then
    _superset_home_dir="$HOME"
    while [ "\${#_superset_home_dir}" -gt 0 ] && [ "\${_superset_home_dir%/}" != "$_superset_home_dir" ]; do
      _superset_home_dir="\${_superset_home_dir%/}"
    done
    _superset_home_claude="\${_superset_home_dir}/.claude"
  fi

  _superset_dir_is_managed=""
  if [ -n "$_superset_default_dir" ] \\
    && { [ "$_superset_claude_config_dir" = "$_superset_default_dir" ] || [ "$_superset_claude_config_dir" -ef "$_superset_default_dir" ]; }; then
    _superset_dir_is_managed="1"
  elif [ -n "$_superset_home_claude" ] \\
    && { [ "$_superset_claude_config_dir" = "$_superset_home_claude" ] || [ "$_superset_claude_config_dir" -ef "$_superset_home_claude" ]; }; then
    _superset_dir_is_managed="1"
  fi

  _superset_candidate_settings="$_superset_claude_home_dir/hooks/${CLAUDE_MANAGED_SETTINGS_FILE}"
  if [ -z "$_superset_dir_is_managed" ] && [ -f "$_superset_candidate_settings" ]; then
    _superset_skip_claude_settings=""
    _superset_expect_arg=""
    _superset_skip_optional=""
    _superset_skip_variadic=""
    _superset_seen_positional=""
    _superset_print_mode=""
    for _superset_arg in "$@"; do
      if [ -n "$_superset_expect_arg" ]; then
        if [ "$_superset_expect_arg" = "setting-sources" ]; then
          case ",\${_superset_arg//[[:space:]]/}," in
            *,user,*) ;;
            *) _superset_skip_claude_settings="1"; break ;;
          esac
        fi
        _superset_expect_arg=""
        continue
      fi
      [ "$_superset_arg" = "--" ] && break
      if [ -n "$_superset_skip_optional" ]; then
        _superset_skip_optional=""
        case "$_superset_arg" in
          -*) ;;
          *) continue ;;
        esac
      fi
      if [ -n "$_superset_skip_variadic" ]; then
        case "$_superset_arg" in
          -*) _superset_skip_variadic="" ;;
          *) continue ;;
        esac
      fi
      case "$_superset_arg" in
        -h|--help|-v|-V|--version|--bare|--safe-mode|--settings|--settings=*)
          _superset_skip_claude_settings="1"
          break
          ;;
        --setting-sources)
          _superset_expect_arg="setting-sources"
          ;;
        --setting-sources=*)
          _superset_sources="\${_superset_arg#--setting-sources=}"
          case ",\${_superset_sources//[[:space:]]/}," in
            *,user,*) ;;
            *) _superset_skip_claude_settings="1"; break ;;
          esac
          ;;
        -p|--print)
          _superset_print_mode="1"
          ;;
        -n|--name|--agent|--agents|--append-system-prompt|--append-system-prompt-file|--autocompact|--channels|--debug-file|--effort|--environment|--fallback-model|--input-format|--json-schema|--max-budget-usd|--max-thinking-tokens|--max-turns|--model|--output-format|--permission-mode|--permission-prompt-tool|--permission-prompts|--plugin-dir|--plugin-dir-no-mcp|--plugin-url|--project-config-root|--remote-control-session-name-prefix|--resume-session-at|--session-id|--system-prompt|--system-prompt-file|--system-prompt-snapshot|--task-budget|--thinking-display)
          _superset_expect_arg="1"
          ;;
        -d|--debug|-r|--resume|-w|--worktree|--cloud|--from-pr|--prompt-suggestions|--remote-control|--teleport)
          _superset_skip_optional="1"
          ;;
        --add-dir|--allowedTools|--allowed-tools|--betas|--disallowedTools|--disallowed-tools|--file|--mcp-config|--tools)
          _superset_skip_variadic="1"
          ;;
        -*)
          ;;
        *)
          if [ -z "$_superset_seen_positional" ] && [ -z "$_superset_print_mode" ]; then
            case "$_superset_arg" in
              agents|attach|auth|auto-mode|config|doctor|gateway|import|install|kill|logs|mcp|migrate-installer|plugin|plugins|purge|respawn|rm|setup-token|stop|ultrareview|update|upgrade)
                _superset_skip_claude_settings="1"
                break
                ;;
            esac
          fi
          _superset_seen_positional="1"
          ;;
      esac
    done
    [ "$_superset_expect_arg" = "setting-sources" ] && _superset_skip_claude_settings="1"
    if [ -z "$_superset_skip_claude_settings" ]; then
      _superset_claude_settings="$_superset_candidate_settings"
    fi
  fi
fi

if [ -n "$_superset_claude_settings" ]; then
  exec "$REAL_BIN" --settings "$_superset_claude_settings" "$@"
fi
exec "$REAL_BIN" "$@"`;
}

/**
 * Wrapper for Claude: forwards SUPERSET_* env vars, follows Usage-tab account
 * switches, and loads managed hooks via --settings for unmanaged CLAUDE_CONFIG_DIR.
 */
export function createClaudeWrapper(): void {
	const script = buildWrapperScript("claude", buildClaudeWrapperExecLine(), {
		agentId: "claude",
		beforeLaunch: buildDefaultAccountResolver(
			"CLAUDE_CONFIG_DIR",
			"default-claude-config-dir",
		),
	});
	createWrapper("claude", script);
}

/**
 * Creates the Codex wrapper that enables native hooks and session-log signals,
 * and follows the Usage-tab account switch at launch time.
 */
export function createCodexWrapper(): void {
	const notifyPath = getNotifyScriptPath();
	const script = buildWrapperScript(
		"codex",
		buildCodexWrapperExecLine(notifyPath),
		{
			agentId: "codex",
			beforeLaunch: buildDefaultAccountResolver(
				"CODEX_HOME",
				"default-codex-home",
				"SUPERSET_AMBIENT_CODEX_HOME",
			),
		},
	);
	createWrapper("codex", script);
}

/**
 * Builds the Codex wrapper exec block from the shell template.
 */
export function buildCodexWrapperExecLine(notifyPath: string): string {
	const template = fs.readFileSync(
		getTemplatePath("codex-wrapper-exec.template.sh"),
		"utf-8",
	);
	return template.replaceAll("{{NOTIFY_PATH}}", notifyPath);
}

/**
 * Writes to environment-specific path only, NOT the global path.
 * Global path causes dev/prod conflicts when both are running.
 */
export function createOpenCodePlugin(): void {
	const pluginPath = getOpenCodePluginPath();
	const notifyPath = getNotifyScriptPath();
	const content = getOpenCodePluginContent(notifyPath);
	const changed = writeFileIfChanged(pluginPath, content, 0o644);
	(changed ? console.log : console.debug)(
		`[agent-setup] ${changed ? "Updated" : "Verified"} OpenCode plugin`,
	);
}

export function createOpenCodeTuiPlugin(): void {
	fs.mkdirSync(getOpenCodeTuiPluginDir(), { recursive: true });
	const content = getOpenCodeTuiPluginContent(getNotifyScriptPath());
	const changed = writeFileIfChanged(
		getOpenCodeTuiPluginPath(),
		content,
		0o644,
	);
	(changed ? console.log : console.debug)(
		`[agent-setup] ${changed ? "Updated" : "Verified"} OpenCode TUI plugin`,
	);
}

export function removeOpenCodeTuiPlugin(): void {
	removeOwnedFileIfMarked(
		getOpenCodeTuiPluginPath(),
		OPENCODE_TUI_PLUGIN_SIGNATURE,
		"OpenCode TUI plugin",
	);
}

/**
 * Removes stale global plugin written by older versions.
 * Only removes if the file contains our signature to avoid deleting user plugins.
 */
export function cleanupGlobalOpenCodePlugin(): void {
	try {
		const globalPluginPath = getOpenCodeGlobalPluginPath();
		if (!fs.existsSync(globalPluginPath)) return;

		const content = fs.readFileSync(globalPluginPath, "utf-8");
		if (content.includes(OPENCODE_PLUGIN_SIGNATURE)) {
			fs.unlinkSync(globalPluginPath);
			console.log(
				"[agent-setup] Removed stale global OpenCode plugin to prevent dev/prod conflicts",
			);
		}
	} catch (error) {
		console.warn(
			"[agent-setup] Failed to cleanup global OpenCode plugin:",
			error,
		);
	}
}

/**
 * Creates the OpenCode wrapper with an environment-scoped config directory.
 */
export function createOpenCodeWrapper(): void {
	const script = buildWrapperScript(
		"opencode",
		`export OPENCODE_CONFIG_DIR="${getOpenCodeConfigDir()}"\nexec "$REAL_BIN" "$@"`,
		{ agentId: "opencode" },
	);
	createWrapper("opencode", script);
}
