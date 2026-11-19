#!/usr/bin/env bash
# Copies the GitHub secret BETTER_AUTH_SECRET into one Vercel project.
# Run by .github/workflows/copy-secret-to-vercel-project.yml. Read that file first.
set -euo pipefail

KEY="BETTER_AUTH_SECRET"
if [ -n "${VERCEL_API:-}" ] && [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "VERCEL_API is for local tests only." >&2
  exit 1
fi
API="${VERCEL_API:-https://api.vercel.com}"

: "${VERCEL_TOKEN:?VERCEL_TOKEN is empty}"
: "${VERCEL_ORG_ID:?VERCEL_ORG_ID is empty}"
: "${PROJECT:?PROJECT is empty}"

if [[ ! "$PROJECT" =~ ^[A-Za-z0-9_-][A-Za-z0-9_.-]*$ ]]; then
  echo "PROJECT must be a Vercel project id or name." >&2
  exit 1
fi
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "The GitHub secret BETTER_AUTH_SECRET is empty or not set in the production environment." >&2
  exit 1
fi

response="$(mktemp)"
trap 'rm -f "$response"' EXIT

DEFS='def envs: (.envs // .) | map(.target |= (if type == "array" then . else [.] end));'

fail_with_code() {
  echo "$1 failed. Vercel error code: $(jq -r '.error.code // "unknown"' "$response" 2>/dev/null || echo unknown)" >&2
  exit 1
}

list_envs() {
  curl --fail-with-body -sS -o "$response" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "$API/v10/projects/$PROJECT/env?teamId=$VERCEL_ORG_ID" || fail_with_code "Reading the project env list"
  if ! jq -e '(.pagination.next // null) == null and (.hiddenProductionEnvCount // 0) == 0' "$response" >/dev/null; then
    echo "The env list is paged or hides production variables, so it cannot be trusted. Stopping." >&2
    exit 1
  fi
}

summarize() {
  jq -r --arg key "$KEY" "$DEFS"'
    envs as $envs
    | ($envs | map(select(.key == $key))) as $mine
    | (if ($mine | length) == 0 then "\($key): absent"
       else "\($key): present, \($mine | length) entry, " + ($mine | map("type=\(.type) targets=\(.target | join(","))") | join("; "))
       end),
      "Other variables: \($envs | map(select(.key != $key)) | length)"
  ' "$response"
}

other_count() {
  jq -r --arg key "$KEY" "$DEFS"'envs | map(select(.key != $key)) | length' "$response"
}

key_present() {
  jq -e --arg key "$KEY" "$DEFS"'envs | any(.key == $key)' "$response" >/dev/null
}

list_envs
summarize
before="$(other_count)"
present=false
if key_present; then present=true; fi

if [ "${APPLY:-false}" != "true" ]; then
  if [ "$present" = "true" ]; then
    echo "Dry run. The key exists, so apply will refuse unless overwrite is also checked."
  else
    echo "Dry run. The key is absent, so apply will create it (sensitive, production and preview)."
  fi
  exit 0
fi
if [ "$present" = "true" ] && [ "${OVERWRITE:-false}" != "true" ]; then
  echo "$KEY already exists in the project. Nothing was written. Check overwrite to replace it." >&2
  exit 1
fi

jq -n '{key: "BETTER_AUTH_SECRET", value: $ENV.BETTER_AUTH_SECRET, type: "sensitive", target: ["production", "preview"]}' |
  curl --fail-with-body -sS -o "$response" -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @- \
    "$API/v10/projects/$PROJECT/env?upsert=true&teamId=$VERCEL_ORG_ID" || fail_with_code "The upsert"

failed="$(jq -r '.failed | length' "$response")"
echo "Upsert answered. Failed entries: $failed"
if [ "$failed" != "0" ]; then
  echo "Vercel reported a failed entry. Stopping." >&2
  exit 1
fi

list_envs
echo "After apply:"
summarize
after="$(other_count)"

if [ "$before" != "$after" ]; then
  echo "The count of other variables changed from $before to $after." >&2
  exit 1
fi

if ! jq -e --arg key "$KEY" "$DEFS"'
  envs | map(select(.key == $key)) as $mine
  | ($mine | length) > 0 and all($mine[]; .type == "sensitive")
    and (($mine | map(.target) | add | unique) == ["preview", "production"])
' "$response" >/dev/null; then
  echo "$KEY is not sensitive on exactly production and preview. Check the project in Vercel." >&2
  exit 1
fi
echo "Done. $KEY is sensitive on production and preview. Other variables unchanged: $after."
