import { SUPERSET_MANAGED_BINARIES } from "./agent-setup-targets";
export declare const WRAPPER_MARKER = "# SuperestSet agent-wrapper v5";
export { SUPERSET_MANAGED_BINARIES };
/** Path (under SUPERSET_HOME_DIR) of the runtime notify hook script. */
export declare const MANAGED_NOTIFY_RELATIVE_PATH = "hooks/superestset-notify.sh";
/**
 * Literal substring every guarded managed command contains. Managed-command
 * predicates must match it: the guarded form carries neither an absolute
 * notify path nor a `/.superset/` segment, so without this check a re-merge
 * would fail to recognize its own entries and append duplicates.
 */
export declare const DYNAMIC_NOTIFY_PATH_MARKER = "$SUPERSET_HOME_DIR/hooks/superestset-notify.sh";
/**
 * Shell command written into an agent's global hook config. The notify path is
 * resolved at runtime from SUPERSET_HOME_DIR so one shared config works for both
 * dev and prod installs. `SUPERSET_HOOK_HARNESS` names the harness whose config
 * this command lives in; it is the identity fallback when the agent was
 * launched outside the Superset wrapper (system PATH resolved the real binary,
 * so no `SUPERSET_AGENT_ID` was exported). It must never override the wrapper's
 * export: one harness can run another's hook config — cursor-agent replays
 * `~/.claude/settings.json`, and an agent's tool call can launch a second CLI
 * whose config fires under the terminal's agent — and the notify script uses
 * the disagreement to drop those events instead of relabeling the terminal.
 */
export declare function getManagedNotifyHookCommand(agentId: string): string;
export declare const MANAGED_ARTIFACT_GUARD_RELATIVE_PATH = "hooks/superestset-artifact-guard.sh";
export declare const DYNAMIC_ARTIFACT_GUARD_PATH_MARKER = "$SUPERSET_HOME_DIR/hooks/superestset-artifact-guard.sh";
export declare function getManagedArtifactGuardHookCommand(): string;
import { writeFileIfChanged } from "./write-file-if-changed";
export { writeFileIfChanged };
/**
 * Deletes a wholly Superset-owned file, gated on its content signature so a
 * user file at the same path is never removed.
 */
export declare function removeOwnedFileIfMarked(filePath: string, signature: string, label: string): void;
export declare function isSupersetManagedHookCommand(command: string | undefined, scriptName: string): boolean;
/**
 * Recognizes every form of Superset's notify hook command: the current
 * guarded form (dynamic marker), a current absolute notify path, and stale
 * absolute paths from other installs/worktrees.
 */
export declare function isManagedNotifyCommand(command: string | undefined, notifyScriptPath: string): boolean;
export declare function isManagedArtifactGuardCommand(command: string | undefined, artifactGuardScriptPath: string): boolean;
/**
 * Shell block that re-resolves the Usage-tab default account at launch.
 * The PTY env is frozen at terminal spawn, so an account switch would
 * otherwise reach only brand-new terminals; this re-reads the host's
 * pointer file every time the agent starts instead. Superset terminals
 * only, and a value the user exported by hand — one that differs from what
 * Superset injected at spawn — always wins. A missing pointer file (older
 * host build) changes nothing; an empty one means the system default.
 */
export declare function buildDefaultAccountResolver(envVar: string, pointerName: string, ambientEnvVar?: string): string;
export declare function getWrapperPath(binaryName: string): string;
export interface BuildWrapperScriptOptions {
    /**
     * `BuiltinAgentId` for the wrapped binary (e.g. "claude", "codex"). When
     * set, the wrapper exports `SUPERSET_AGENT_ID` so the agent process and
     * any hook subprocess it spawns inherit the wrapper-level identity. The
     * notify-hook script forwards this into the v2 hook payload.
     *
     * The export is first-wins: `SUPERSET_AGENT_ID` already being set means a
     * wrapper ran earlier in this terminal and this launch is nested under
     * its agent (a tool call running another CLI). The terminal's agent is
     * the outer one, so the wrapper keeps that identity and skips the launch
     * report. The host strips `SUPERSET_*` from every PTY env, so the
     * variable can only arrive from a wrapper in the same terminal.
     */
    agentId?: string;
    beforeLaunch?: string;
}
export declare function buildWrapperScript(binaryName: string, execLine: string, options?: BuildWrapperScriptOptions): string;
export declare function createWrapper(binaryName: string, script: string): void;
//# sourceMappingURL=agent-wrappers-common.d.ts.map