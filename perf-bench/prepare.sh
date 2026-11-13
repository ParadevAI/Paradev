#!/usr/bin/env bash
# Copies the harness into a worktree and writes the per-commit compat shim.
set -euo pipefail
wt=$1
dest="$wt/apps/desktop/src/renderer/__bench__"
cs='renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession'
csdir="$wt/apps/desktop/src/$cs"
rm -rf "$dest" && mkdir -p "$dest"
cp /workspace/perf-bench/harness/{bench.tsx,bench.html,bench.config.mts,fixture.ts} "$dest/"
{
  if [ -d "$csdir/components/SessionView/utils/withStoredHistory" ]; then
    echo "export { withStoredHistory } from \"$cs/components/SessionView/utils/withStoredHistory\";"
  else
    echo "export const withStoredHistory = null as null | ((a: any, b: any) => any);"
  fi
  if [ -d "$csdir/components/Transcript/providers/SessionModeProvider" ]; then
    echo "export { SessionModeProvider } from \"$cs/components/Transcript/providers/SessionModeProvider\";"
  else
    echo "import type { ReactNode } from \"react\";"
    echo "export function SessionModeProvider({ children }: { value?: string; children: ReactNode }) { return children; }"
  fi
} > "$dest/compat.ts"
cat "$dest/compat.ts"
