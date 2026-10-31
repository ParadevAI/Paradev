import fs from "node:fs";
import path from "node:path";
import { SUPERSET_MANAGED_BINARIES } from "./agent-setup-targets";
import { ARTIFACT_GUARD_SCRIPT_NAME } from "./artifact-guard-hook";
import { NOTIFY_SCRIPT_NAME } from "./notify-hook";
import { getBinDir } from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v5";
export { SUPERSET_MANAGED_BINARIES };

/** Path (under SUPERSET_HOME_DIR) of the runtime notify hook script. */
export const MANAGED_NOTIFY_RELATIVE_PATH = `hooks/${NOTIFY_SCRIPT_NAME}`;

/**
 * Literal substring every guarded managed command contains. Managed-command
 * predicates must match it: the guarded form carries neither an absolute
 * notify path nor a `/.superset/` segment, so without this check a re-merge
 * would fail to recognize its own entries and append duplicates.
 */
export const DYNAMIC_NOTIFY_PATH_MARKER = `$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}`;

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
 *
 * `eventType` sets `SUPERSET_HOOK_EVENT` for harnesses whose payload does not
 * name the event (Antigravity); the notify script prefers it over the payload.
 */
export function getManagedNotifyHookCommand(
	agentId: string,
	eventType?: string,
): string {
	const eventAssignment = eventType ? ` SUPERSET_HOOK_EVENT=${eventType}` : "";
	return `[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" ] && SUPERSET_HOOK_HARNESS=${agentId}${eventAssignment} "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" || true`;
}

export const MANAGED_ARTIFACT_GUARD_RELATIVE_PATH = `hooks/${ARTIFACT_GUARD_SCRIPT_NAME}`;

export const DYNAMIC_ARTIFACT_GUARD_PATH_MARKER = `$SUPERSET_HOME_DIR/${MANAGED_ARTIFACT_GUARD_RELATIVE_PATH}`;

export function getManagedArtifactGuardHookCommand(): string {
	return `[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/${MANAGED_ARTIFACT_GUARD_RELATIVE_PATH}" ] && "$SUPERSET_HOME_DIR/${MANAGED_ARTIFACT_GUARD_RELATIVE_PATH}" || true`;
}

// Dev setup (.superset/lib/setup/steps.sh) points SUPERSET_HOME_DIR at
// $PWD/superset-dev-data — without a leading dot — so we must recognize that
// variant to reap stale notify.sh paths from deleted worktrees.
const SUPERSET_MANAGED_HOOK_PATH_PATTERN =
	/\/(?:\.superset(?:-[^/'"\s\\]+)?|superset-dev-data)\//;

import { writeFileIfChanged } from "./write-file-if-changed";

export { writeFileIfChanged };

/**
 * Deletes a wholly Superset-owned file, gated on its content signature so a
 * user file at the same path is never removed.
 */
export function removeOwnedFileIfMarked(
	filePath: string,
	signature: string,
	label: string,
): void {
	try {
		if (!fs.existsSync(filePath)) return;
		const content = fs.readFileSync(filePath, "utf-8");
		if (!content.includes(signature)) return;
		fs.unlinkSync(filePath);
		console.log(`[agent-setup] Removed ${label}`);
	} catch (error) {
		console.warn(`[agent-setup] Failed to remove ${label}:`, error);
	}
}

export function isSupersetManagedHookCommand(
	command: string | undefined,
	scriptName: string,
): boolean {
	if (!command) return false;
	const normalized = command.replaceAll("\\", "/");
	if (!normalized.includes(`/hooks/${scriptName}`)) return false;
	return SUPERSET_MANAGED_HOOK_PATH_PATTERN.test(normalized);
}

/**
 * Recognizes every form of Superset's notify hook command: the current
 * guarded form (dynamic marker), a current absolute notify path, and stale
 * absolute paths from other installs/worktrees.
 */
export function isManagedNotifyCommand(
	command: string | undefined,
	notifyScriptPath: string,
): boolean {
	return Boolean(
		command?.includes(notifyScriptPath) ||
			command?.includes(DYNAMIC_NOTIFY_PATH_MARKER) ||
			isSupersetManagedHookCommand(command, NOTIFY_SCRIPT_NAME),
	);
}

export function isManagedArtifactGuardCommand(
	command: string | undefined,
	artifactGuardScriptPath: string,
): boolean {
	return Boolean(
		command?.includes(artifactGuardScriptPath) ||
			command?.includes(DYNAMIC_ARTIFACT_GUARD_PATH_MARKER) ||
			isSupersetManagedHookCommand(command, ARTIFACT_GUARD_SCRIPT_NAME),
	);
}

function buildRealBinaryResolver(): string {
	return `find_real_binary() {
  local name="$1"
  local IFS=:
  for dir in $PATH; do
    [ -z "$dir" ] && continue
    dir="\${dir%/}"
    case "$dir" in
      "${getBinDir()}"|"$HOME"/.superset/bin|"$HOME"/.superset-*/bin) continue ;;
    esac
    if [ -x "$dir/$name" ] && [ ! -d "$dir/$name" ]; then
      printf "%s\\n" "$dir/$name"
      return 0
    fi
  done
  return 1
}
`;
}

export interface DefaultAccountResolverOptions {
	/** Holds the system-default value while a selected account is injected. */
	ambientEnvVar?: string;
	/**
	 * Commands that sign in or out, as their words: "login", "auth login".
	 * Each word has to be a whole argument, in that order, before any `--`.
	 * Other arguments may come before or between the words, so a root option
	 * ahead of the subcommand (`codex -c key=value login`) still matches, and
	 * a one-argument prompt ("auth login") does not. A launch that asks for
	 * help (`-h`, `--help`, or `help` first) never matches.
	 */
	credentialCommands?: readonly string[];
	/**
	 * A credential command followed directly by words that make it only read
	 * the login, e.g. "login status". Such a launch is not a credential command.
	 */
	readOnlyCommands?: readonly string[];
}

/**
 * Shell block that re-resolves the Usage-tab default account at launch.
 * The PTY env is frozen at terminal spawn, so an account switch would
 * otherwise reach only brand-new terminals; this re-reads the host's
 * pointer file every time the agent starts instead. Superset terminals
 * only, and a value the user exported by hand — one that differs from what
 * Superset injected at spawn — always wins. A missing pointer file (older
 * host build) changes nothing; an empty one means the system default.
 *
 * A credential command leaves an unset value unset, and it changes the
 * login of the selected account only after the user confirms on a terminal.
 */
export function buildDefaultAccountResolver(
	envVar: string,
	pointerName: string,
	options: DefaultAccountResolverOptions = {},
): string {
	const {
		ambientEnvVar,
		credentialCommands = [],
		readOnlyCommands = [],
	} = options;
	const pointer = `"$SUPERSET_HOME_DIR/state/${pointerName}"`;
	const restoreSystemDefault = ambientEnvVar
		? `if [ -n "\${${ambientEnvVar}}" ]; then
    export ${envVar}="\${${ambientEnvVar}}"
    export SUPERSET_DEFAULT_${envVar}="\${${ambientEnvVar}}"
  else
    unset ${envVar}
    unset SUPERSET_DEFAULT_${envVar}
  fi`
		: `unset ${envVar}
  unset SUPERSET_DEFAULT_${envVar}`;
	const guardsCredentials = credentialCommands.length > 0;
	const matchCredentialCommand = guardsCredentials
		? buildCredentialCommandMatch(credentialCommands, readOnlyCommands)
		: "";
	const keepUnsetForCredentials = guardsCredentials
		? ` \\
  && { [ -n "\${${envVar}}" ] || [ -z "$superset_credential_command" ]; }`
		: "";
	const guardCredentialCommand = guardsCredentials
		? buildCredentialCommandGuard(envVar, ambientEnvVar)
		: "";
	return `${matchCredentialCommand}if [ -n "$SUPERSET_TERMINAL_ID" ] && [ -n "$SUPERSET_HOME_DIR" ] \\
  && { [ -z "\${${envVar}}" ] || [ "\${${envVar}}" = "\${SUPERSET_DEFAULT_${envVar}}" ]; }${keepUnsetForCredentials} \\
  && [ -f ${pointer} ]; then
  superset_default_account="$(cat ${pointer} 2>/dev/null)"
  if [ -n "$superset_default_account" ] && [ -d "$superset_default_account" ]; then
    export ${envVar}="$superset_default_account"
    export SUPERSET_DEFAULT_${envVar}="$superset_default_account"
  else
    ${restoreSystemDefault}
  fi
fi
${guardCredentialCommand}
`;
}

const CREDENTIAL_COMMAND_WORD = /^[a-z]+$/;

/**
 * Sets `superset_credential_command` (e.g. "codex login") when the arguments
 * hold one of `commands`. Each argument before `--` adds one token to
 * `superset_command_tokens`, wrapped in spaces: a command word stays itself
 * and anything else becomes ".". The patterns below therefore only ever
 * match whole arguments, never text inside a prompt or an option value.
 */
function buildCredentialCommandMatch(
	commands: readonly string[],
	readOnlyCommands: readonly string[],
): string {
	const wordsOf = (command: string) => command.split(" ");
	const words = [
		...new Set([...commands, ...readOnlyCommands].flatMap(wordsOf)),
	];
	for (const word of words) {
		if (!CREDENTIAL_COMMAND_WORD.test(word)) {
			throw new Error(`Unsupported credential command word: "${word}"`);
		}
	}
	const inOrder = (command: string) =>
		`*${wordsOf(command)
			.map((word) => `" ${word} "`)
			.join("*")}*`;
	const adjacent = (command: string) => `*" ${wordsOf(command).join("  ")} "*`;
	const matches = commands.map((command) => {
		const readOnly = readOnlyCommands
			.filter((other) => other.startsWith(`${command} `))
			.map((other) => `\n  ${adjacent(other)}) ;;`)
			.join("");
		return `case "$superset_command_tokens" in${readOnly}
  ${inOrder(command)}) superset_credential_command="\${0##*/} ${command}" ;;
esac`;
	});
	return `superset_command_tokens=""
for superset_arg in "$@"; do
  case "$superset_arg" in
    --) break ;;
    -h|--help) superset_command_tokens=""; break ;;
    ${words.join("|")}) superset_command_tokens="$superset_command_tokens $superset_arg " ;;
    *) superset_command_tokens="$superset_command_tokens . " ;;
  esac
done
case "$1" in help) superset_command_tokens="" ;; esac
superset_credential_command=""
${matches.join("\n")}
`;
}

/**
 * Stops a credential command that would change the selected account's login
 * until the user confirms on a terminal. stderr has to be a terminal, so the
 * question is seen; the answer comes from stdin, or from /dev/tty when stdin
 * carries the CLI's own input (`printf '%s' "$KEY" | codex login
 * --with-api-key`). Without a terminal the command does not run, and the
 * refusal names the home but no command to run instead: in a workspace, the
 * callers without a terminal are mostly agents' tool calls. A
 * pseudo-terminal counts as a terminal, so an agent that drives one can
 * still answer. After a "no", the hint points at the system default.
 */
function buildCredentialCommandGuard(
	envVar: string,
	ambientEnvVar?: string,
): string {
	const notSystemDefault = ambientEnvVar
		? ` && [ "\${${envVar}}" != "\${${ambientEnvVar}}" ]`
		: "";
	const cancelled =
		"Paradev: cancelled. To run it on the system default instead:";
	const unsetHint = `printf '${cancelled} env -u ${envVar} %s' "\${0##*/}" >&2`;
	const systemDefaultHint = ambientEnvVar
		? `if [ -n "\${${ambientEnvVar}}" ]; then
        printf '${cancelled} ${envVar}=%q %s' "\${${ambientEnvVar}}" "\${0##*/}" >&2
      else
        ${unsetHint}
      fi`
		: unsetHint;
	return `if [ -n "$superset_credential_command" ] && [ -n "\${${envVar}}" ] \\
  && [ "\${${envVar}}" = "\${SUPERSET_DEFAULT_${envVar}}" ]${notSystemDefault}; then
  superset_reply_from=""
  if [ -t 2 ]; then
    if [ -t 0 ]; then
      superset_reply_from="stdin"
    elif (: </dev/tty) 2>/dev/null; then
      superset_reply_from="tty"
    fi
  fi
  if [ -z "$superset_reply_from" ]; then
    printf 'Paradev: %s would change the login in %s, the account you made the default for new agents. Nothing was run: a person has to confirm this in a terminal.\\n' \\
      "$superset_credential_command" "\${${envVar}}" >&2
    exit 2
  fi
  printf 'Paradev: %s will change the login in %s, the account you made the default for new agents. Continue? [y/N] ' \\
    "$superset_credential_command" "\${${envVar}}" >&2
  superset_reply=""
  if [ "$superset_reply_from" = "tty" ]; then
    read -r superset_reply </dev/tty
  else
    read -r superset_reply
  fi
  case "$superset_reply" in
    [yY]|[yY][eE][sS]) ;;
    *)
      ${systemDefaultHint}
      printf ' %q' "$@" >&2
      printf '\\n' >&2
      exit 1
      ;;
  esac
fi
`;
}

function getMissingBinaryMessage(name: string): string {
	return `Paradev: ${name} not found in PATH. Install it and ensure it is on PATH, then retry.`;
}

export function getWrapperPath(binaryName: string): string {
	return path.join(getBinDir(), binaryName);
}

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

/**
 * Shell block that reports the agent launch to the host so the terminal gets
 * an agent binding the moment a harness starts — not on its first native hook.
 * Some harnesses defer their SessionStart hook until the first turn (Codex
 * creates its rollout lazily, so an idle or resumed TUI fires nothing) and
 * some have no session hooks at all (vibe); the wrapper is the one launch-time
 * signal every harness shares. The report is delayed and liveness-gated so
 * `--help`-style probes that exit right away never bind a pane, and the
 * subshell survives `exec` — after it, the captured pid IS the agent process.
 * Harnesses with working native SessionStart hooks fire too; the host upsert
 * makes the duplicate harmless and lets them attach the real session id.
 */
function buildLaunchReportBlock(): string {
	return `_superset_skip_launch_report=""
for _superset_arg in "$@"; do
  # Tokens past \`--\` are prompt text, never flags.
  [ "$_superset_arg" = "--" ] && break
  case "$_superset_arg" in
    --help|-h|--version|-V|-v)
      _superset_skip_launch_report="1"
      break
      ;;
  esac
done
if [ -z "$_superset_skip_launch_report" ] && [ -n "$SUPERSET_TERMINAL_ID" ] \\
  && [ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" ]; then
  _superset_launch_pid=$$
  (
    sleep 2
    kill -0 "$_superset_launch_pid" 2>/dev/null || exit 0
    exec "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" '{"hook_event_name":"SessionStart"}'
  ) >/dev/null 2>&1 </dev/null &
fi

`;
}

export function buildWrapperScript(
	binaryName: string,
	execLine: string,
	options: BuildWrapperScriptOptions = {},
): string {
	// See BuildWrapperScriptOptions.agentId for why the export is first-wins.
	const identity = options.agentId
		? `if [ -z "$SUPERSET_AGENT_ID" ]; then
export SUPERSET_AGENT_ID="${options.agentId}"
export SUPERSET_AGENT_LAUNCH_ID="$$-$(date +%s)"

${buildLaunchReportBlock()}fi

`
		: "";
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for ${binaryName}

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "${binaryName}")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage(binaryName)}" >&2
  exit 127
fi

${options.beforeLaunch ?? ""}${identity}${execLine}
`;
}

export function createWrapper(binaryName: string, script: string): void {
	const changed = writeFileIfChanged(getWrapperPath(binaryName), script, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} ${binaryName} wrapper`,
	);
}
