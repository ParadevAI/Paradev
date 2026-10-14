export declare const OPENCODE_PLUGIN_FILE = "superestset-notify.js";
export declare const OPENCODE_PLUGIN_MARKER = "// SuperestSet opencode plugin v11";
/**
 * Returns the environment-scoped OpenCode plugin path under Superset home.
 */
export declare function getOpenCodePluginPath(): string;
/** @see https://opencode.ai/docs/plugins */
export declare function getOpenCodeGlobalPluginPath(): string;
/** Shell command written into Claude's global hook config. */
export declare function getClaudeManagedHookCommand(): string;
export declare const CLAUDE_ARTIFACT_GUARD_EVENT = "PreToolUse";
export declare const CLAUDE_ARTIFACT_GUARD_MATCHER = "Artifact";
/**
 * Returns the global Claude settings path used for native hook registration.
 */
export declare function getClaudeGlobalSettingsJsonPath(): string;
/**
 * Reads existing ~/.claude/settings.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks
 * and all non-hook settings.
 *
 * Claude Code uses the same nested hook structure as Droid:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export declare function getClaudeGlobalSettingsJsonContent(notifyScriptPath: string): string | null;
/**
 * Writes Superset hook definitions directly into ~/.claude/settings.json.
 * This ensures hooks work regardless of whether the binary wrapper is in PATH,
 * matching the approach used for Cursor, Gemini, Droid, and Mastra.
 */
export declare function createClaudeSettingsJson(): void;
/**
 * Removes Superset-managed hook entries from ~/.claude/settings.json,
 * preserving user hooks and all non-hook settings. No-op when the file does
 * not exist — teardown must never create config files.
 */
export declare function removeClaudeManagedHooks(): void;
/**
 * Merges Superset hooks into `<configDir>/settings.json` for a secondary
 * Claude profile (CLAUDE_CONFIG_DIR account). Without this, agents launched
 * on a non-default account would lose lifecycle/status hooks — Claude reads
 * settings exclusively from the active config dir.
 */
export declare function ensureClaudeManagedHooksAt(configDir: string): void;
/**
 * Returns the global Codex hooks.json path used for fallback hook registration.
 */
export declare function getCodexGlobalHooksJsonPath(): string;
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
export declare function getCodexGlobalHooksJsonContent(notifyScriptPath: string): string | null;
/**
 * Writes Superset hook definitions directly into ~/.codex/hooks.json.
 * This provides a fallback notification path that works even when the
 * binary wrapper is not in PATH (e.g. user runs codex from outside
 * a Superset terminal).
 */
export declare function createCodexHooksJson(): void;
/**
 * Removes Superset-managed hook entries from ~/.codex/hooks.json, preserving
 * user hooks. No-op when the file does not exist.
 */
export declare function removeCodexManagedHooks(): void;
/**
 * Merges Superset hooks into `<codexHome>/hooks.json` for a secondary Codex
 * home (CODEX_HOME account) — same rationale as ensureClaudeManagedHooksAt.
 */
export declare function ensureCodexManagedHooksAt(codexHome: string): void;
/**
 * Renders the OpenCode plugin file content with the current notify script path.
 */
export declare function getOpenCodePluginContent(notifyPath: string): string;
/**
 * Wrapper for Claude: forwards SUPERSET_* env vars into the agent process
 * tree and follows the Usage-tab account switch at launch time. Hooks live
 * in ~/.claude/settings.json (createClaudeSettingsJson).
 */
export declare function createClaudeWrapper(): void;
/**
 * Creates the Codex wrapper that enables native hooks and session-log signals,
 * and follows the Usage-tab account switch at launch time.
 */
export declare function createCodexWrapper(): void;
/**
 * Builds the Codex wrapper exec block from the shell template.
 */
export declare function buildCodexWrapperExecLine(notifyPath: string): string;
/**
 * Writes to environment-specific path only, NOT the global path.
 * Global path causes dev/prod conflicts when both are running.
 */
export declare function createOpenCodePlugin(): void;
/**
 * Removes stale global plugin written by older versions.
 * Only removes if the file contains our signature to avoid deleting user plugins.
 */
export declare function cleanupGlobalOpenCodePlugin(): void;
/**
 * Creates the OpenCode wrapper with an environment-scoped config directory.
 */
export declare function createOpenCodeWrapper(): void;
//# sourceMappingURL=agent-wrappers-claude-codex-opencode.d.ts.map