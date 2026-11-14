import fs from "node:fs";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	removeOwnedFileIfMarked,
} from "./agent-wrappers-common";
import { getTemplatePath } from "./config";
import { getHooksDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export const PRIME_AGENT_EXTENSION_FILE = "prime-agent-notify.mjs";
export const PRIME_AGENT_WATCHER_FILE = "prime-agent-watch.mjs";

const PRIME_AGENT_WATCHER_SIGNATURE = "// Superset Prime Agent watcher";

const PRIME_AGENT_EXTENSION_SIGNATURE = "// Superset Prime Agent extension";

// A reused Prime Agent daemon keeps its own environment, so the launching
// terminal's identity reaches the extension through a bridge file instead.
const PRIME_AGENT_BRIDGE_ENV_VARS = [
	"SUPERSET_TERMINAL_ID",
	"SUPERSET_TAB_ID",
	"SUPERSET_PANE_ID",
	"SUPERSET_WORKSPACE_ID",
	"SUPERSET_HOME_DIR",
	"SUPERSET_HOST_AGENT_HOOK_URL",
	"SUPERSET_HOOK_VERSION",
	"SUPERSET_AGENT_LAUNCH_ID",
	"SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN",
	"SUPERSET_ENV",
	"SUPERSET_PORT",
	"SUPERSET_DEBUG_HOOKS",
	"SUPERSET_HOOK_DEBUG_LOG",
] as const;

const PRIME_AGENT_PASSTHROUGH_COMMANDS = [
	"help",
	"agents",
	"list",
	"sessions",
	"attach",
	"stop",
	"rename",
	"send",
	"schedule",
	"status",
	"doctor",
	"incident",
	"shutdown",
	"mcp",
	"package",
	"update",
	"model",
	"session",
	"config",
	"telemetry",
	"factory",
	"prompt",
	"--help",
	"-h",
	"--version",
	"-v",
] as const;

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function getPrimeAgentExtensionPath(): string {
	return path.join(getHooksDir(), PRIME_AGENT_EXTENSION_FILE);
}

export function getPrimeAgentExtensionContent(): string {
	return fs.readFileSync(getTemplatePath(PRIME_AGENT_EXTENSION_FILE), "utf8");
}

export function getPrimeAgentWatcherPath(): string {
	return path.join(getHooksDir(), PRIME_AGENT_WATCHER_FILE);
}

export function createPrimeAgentExtension(): void {
	const changed = writeFileIfChanged(
		getPrimeAgentExtensionPath(),
		getPrimeAgentExtensionContent(),
		0o644,
	);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Prime Agent extension`,
	);
	const watcherChanged = writeFileIfChanged(
		getPrimeAgentWatcherPath(),
		fs.readFileSync(getTemplatePath(PRIME_AGENT_WATCHER_FILE), "utf8"),
		0o644,
	);
	console.log(
		`[agent-setup] ${watcherChanged ? "Updated" : "Verified"} Prime Agent watcher`,
	);
}

export function getPrimeAgentWrapperScript(): string {
	const extensionPath = quoteShellLiteral(getPrimeAgentExtensionPath());
	const watcherPath = quoteShellLiteral(getPrimeAgentWatcherPath());
	const bridgeTemplate = quoteShellLiteral(
		path.join(getHooksDir(), "prime-agent-XXXXXXXX"),
	);
	const writeBridge = `
    const fs = require("node:fs");
    const env = Object.fromEntries(${JSON.stringify(PRIME_AGENT_BRIDGE_ENV_VARS)}
      .map((key) => [key, process.env[key] || ""]));
    env.SUPERSET_PRIME_BRIDGE_PATH = process.argv[1];
    fs.writeFileSync(process.argv[1],
      "import extension from " + JSON.stringify(process.argv[2]) + ";\\n" +
      "export default (pi) => extension(pi, " + JSON.stringify(env) + ");\\n",
      { mode: 0o600 });
  `;
	// The trap keeps a bridge the session loaded: a daemon may reuse it after
	// this client exits. A resume that reuses an older session never loads it.
	return buildWrapperScript(
		"prime-agent",
		`case "$1" in
  ${PRIME_AGENT_PASSTHROUGH_COMMANDS.join("|")})
    exec "$REAL_BIN" "$@" ;;
esac
# Prime Agent's Rust build dropped JS extensions and rejects --extension, so
# the bridge is only passed to a build whose help still lists the flag. Other
# builds get a watcher that polls \`sessions --json\` for the status instead.
_superset_prime_has_extension=""
if [ -n "$SUPERSET_TERMINAL_ID" ] \\
  && "$REAL_BIN" --help 2>/dev/null | grep -Eq -- '(^|[[:space:],])--extension([[:space:],=<]|$)'; then
  _superset_prime_has_extension="1"
fi
if [ -n "$SUPERSET_TERMINAL_ID" ] && [ -z "$_superset_prime_has_extension" ] \\
  && [ -f ${watcherPath} ] && command -v node >/dev/null 2>&1; then
  # The TUI sends an argv message again on every reconnect, so the watcher
  # sends it once instead.
  _superset_prime_prompt=""
  _superset_prime_prompt_dir="$(mktemp -d "\${TMPDIR:-/tmp}/superset-prime-prompt.XXXXXXXX" 2>/dev/null)"
  if [ -n "$_superset_prime_prompt_dir" ] \\
    && node ${watcherPath} split "$_superset_prime_prompt_dir/prompt" "$_superset_prime_prompt_dir/args" "$@" </dev/null \\
    && [ -f "$_superset_prime_prompt_dir/prompt" ]; then
    _superset_prime_args=()
    while IFS= read -r -d '' _superset_prime_arg; do
      _superset_prime_args+=("$_superset_prime_arg")
    done < "$_superset_prime_prompt_dir/args"
    rm -f "$_superset_prime_prompt_dir/args"
    set -- \${_superset_prime_args[@]+"\${_superset_prime_args[@]}"}
    _superset_prime_prompt="$_superset_prime_prompt_dir/prompt"
  fi
  node ${watcherPath} "$$" "$REAL_BIN" "$PWD" "$_superset_prime_prompt" </dev/null >/dev/null 2>&1 &
  _superset_prime_watcher_pid=$!
  "$REAL_BIN" "$@"
  _superset_prime_status=$?
  kill -TERM "$_superset_prime_watcher_pid" 2>/dev/null
  wait "$_superset_prime_watcher_pid" 2>/dev/null
  if [ -n "$_superset_prime_prompt" ] && [ -f "$_superset_prime_prompt" ]; then
    echo "Paradev: could not send the first prompt to Prime Agent. It is saved in $_superset_prime_prompt" >&2
  elif [ -n "$_superset_prime_prompt_dir" ]; then
    rm -rf "$_superset_prime_prompt_dir"
  fi
  exit $_superset_prime_status
fi
if [ -n "$_superset_prime_has_extension" ] && [ -f ${extensionPath} ]; then
  _superset_prime_bridge_dir="$(mktemp -d ${bridgeTemplate} 2>/dev/null)"
  if [ -n "$_superset_prime_bridge_dir" ] && node -e ${quoteShellLiteral(writeBridge)} "$_superset_prime_bridge_dir/bridge.mjs" ${extensionPath}; then
    trap 'if [ ! -f "$_superset_prime_bridge_dir/bridge.mjs.loaded" ]; then
      rm -f "$_superset_prime_bridge_dir/bridge.mjs"
      rmdir "$_superset_prime_bridge_dir" 2>/dev/null || true
    fi' EXIT
    "$REAL_BIN" --extension "$_superset_prime_bridge_dir/bridge.mjs" "$@"
    exit $?
  fi
  if [ -n "$_superset_prime_bridge_dir" ]; then
    rm -f "$_superset_prime_bridge_dir/bridge.mjs"
    rmdir "$_superset_prime_bridge_dir" 2>/dev/null || true
  fi
fi
exec "$REAL_BIN" "$@"`,
		{ agentId: "prime-agent" },
	);
}

export function createPrimeAgentWrapper(): void {
	createWrapper("prime-agent", getPrimeAgentWrapperScript());
}

/** Bridges of running sessions stay; without the extension they go inert. */
export function removePrimeAgentExtension(): void {
	removeOwnedFileIfMarked(
		getPrimeAgentExtensionPath(),
		PRIME_AGENT_EXTENSION_SIGNATURE,
		"Prime Agent extension",
	);
	removeOwnedFileIfMarked(
		getPrimeAgentWatcherPath(),
		PRIME_AGENT_WATCHER_SIGNATURE,
		"Prime Agent watcher",
	);
}
