import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTemplatePath } from "./config";
import { getHooksDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export const CLAUDE_USAGE_STATUSLINE_SCRIPT = "claude-usage-statusline.cjs";
export function createClaudeUsageStatuslineScript(): void {
	writeFileIfChanged(
		join(getHooksDir(), CLAUDE_USAGE_STATUSLINE_SCRIPT),
		readFileSync(getTemplatePath(CLAUDE_USAGE_STATUSLINE_SCRIPT), "utf8"),
		0o755,
	);
}
function quote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
export function claudeUsageStatuslineLaunch(): string {
	const script = `"$SUPERSET_HOME_DIR/hooks/${CLAUDE_USAGE_STATUSLINE_SCRIPT}"`;
	return `if [ "$_superset_capture_usage" = "1" ] && [ "$SUPERSET_AGENT_ID" = "claude" ] && [ -n "$SUPERSET_HOME_DIR" ] && [ -f ${script} ]; then
  _superset_usage_settings=$(ELECTRON_RUN_AS_NODE=1 ${quote(process.execPath)} ${script} --prepare "$@" 2>/dev/null)
  if [ -n "$_superset_usage_settings" ]; then
    exec "$REAL_BIN" --settings "$_superset_usage_settings" "$@"
  fi
fi
exec "$REAL_BIN" "$@"`;
}
