#!/bin/bash
{{MARKER}}
# Antigravity CLI lifecycle hook. Event name in $1, JSON in via stdin; MUST
# print valid JSON to stdout before exit so agy doesn't block on the hook.

INPUT=$(cat)

printf '{}\n'

# ~/.gemini/config/hooks.json is global, so this also fires in sessions
# launched outside Superset terminals; only those terminals set SUPERSET_*
# vars.
[ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0

# The wrapper's identity, or agy when launched without one. Another agent's
# identity means agy is running under it (a tool call), which is not this
# terminal's lifecycle.
[ "${SUPERSET_AGENT_ID:-agy}" = "agy" ] || exit 0

# agy payloads carry no event name; the registered command passes it.
case "$1" in
  SessionStart)  EVENT_TYPE="SessionStart" ;;
  PreInvocation) EVENT_TYPE="UserPromptSubmit" ;;
  PostToolUse)   EVENT_TYPE="PostToolUse" ;;
  Stop)
    # fullyIdle:false means agy is about to continue on its own.
    if printf '%s' "$INPUT" | grep -qE '"fullyIdle"[[:space:]]*:[[:space:]]*false'; then
      exit 0
    fi
    EVENT_TYPE="Stop"
    ;;
  *) exit 0 ;;
esac

CONVERSATION_ID=$(printf '%s' "$INPUT" | grep -oE '"conversationId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 | grep -oE '"[^"]*"$' | tr -d '"')
CONVERSATION_ID=$(printf '%s' "$CONVERSATION_ID" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

NOTIFY_SCRIPT="$(dirname "$0")/notify.sh"
[ -x "$NOTIFY_SCRIPT" ] || exit 0

printf '{"hook_event_name":"%s","session_id":"%s"}' "$EVENT_TYPE" "$CONVERSATION_ID" \
  | SUPERSET_HOOK_HARNESS=agy "$NOTIFY_SCRIPT" > /dev/null

exit 0
