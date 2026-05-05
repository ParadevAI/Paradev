---
description: Round-trip edit a Superset automation's prompt body via $EDITOR.
argument-hint: <automation-id-or-slug>
allowed-tools: Bash(superset:*), Bash(mktemp:*), Bash(${EDITOR}:*), Bash(${VISUAL}:*), Bash(vi:*), Bash(vim:*), Bash(nano:*)
---

Edit a Superset automation prompt in place using the CLI's byte-exact `prompt get | prompt set` round-trip.

This command requires the CLI — there's no terminal-editor flow over MCP. If `superset` isn't on PATH, tell the user to install it: `curl -fsSL https://superset.sh/cli/install.sh | sh`.

## Steps

1. Resolve the automation id from `$ARGUMENTS`. If empty, ask the user.
2. Pull the current prompt to a tempfile, open the user's editor, then push it back:

```bash
ID="$ARGUMENTS"
TMP=$(mktemp -t superset-prompt.XXXXXX.md)
superset automations prompt get "$ID" > "$TMP"
${EDITOR:-${VISUAL:-vi}} "$TMP"

# Skip the upload if the user quit without saving
if [ ! -s "$TMP" ]; then
  echo "Empty prompt — refusing to write."
  rm -f "$TMP"
  exit 1
fi

superset automations prompt set "$ID" --from-file "$TMP"
rm -f "$TMP"
```

3. Confirm the new length. The user can open the automation in Superset to verify.

The CLI refuses to write an empty prompt server-side as well, so the safety check above is belt-and-suspenders.
