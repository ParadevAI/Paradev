#!/usr/bin/env bash
# Copies the GitHub secret BETTER_AUTH_SECRET into one Vercel project.
# Run by .github/workflows/copy-secret-to-vercel-project.yml. Read that file first.
set -euo pipefail

KEY="BETTER_AUTH_SECRET"
API="${VERCEL_API:-https://api.vercel.com}"

: "${VERCEL_TOKEN:?VERCEL_TOKEN is empty}"
: "${VERCEL_ORG_ID:?VERCEL_ORG_ID is empty}"
: "${PROJECT:?The project input is empty}"

if [[ ! "$PROJECT" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "The project input must be a Vercel project id or name." >&2
  exit 1
fi
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "The GitHub secret BETTER_AUTH_SECRET is empty or not set in the production environment." >&2
  exit 1
fi

response="$(mktemp)"
trap 'rm -f "$response"' EXIT

fail_with_code() {
  echo "$1 failed. Vercel error code: $(jq -r '.error.code // "unknown"' "$response" 2>/dev/null || echo unknown)" >&2
  exit 1
}

list_envs() {
  curl --fail-with-body -sS -o "$response" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "$API/v10/projects/$PROJECT/env?teamId=$VERCEL_ORG_ID" || fail_with_code "Reading the project env list"
}

summarize() {
  jq -r --arg key "$KEY" '
    (.envs // .) as $envs
    | ($envs | map(select(.key == $key))) as $mine
    | ($envs | map(select(.key != $key)) | length) as $others
    | (if ($mine | length) == 0 then "\($key): absent"
       else "\($key): present, \($mine | length) entry, " + ($mine | map("type=\(.type) targets=\((.target | if type == "array" then . else [.] end) | join(","))") | join("; "))
       end),
      "Other variables: \($others)"
  ' "$response"
}

other_count() {
  jq -r --arg key "$KEY" '(.envs // .) | map(select(.key != $key)) | length' "$response"
}

list_envs
summarize
before="$(other_count)"

if [ "${APPLY:-false}" != "true" ]; then
  echo "Dry run. Nothing was written. Check apply to create or update $KEY (sensitive, production and preview)."
  exit 0
fi

jq -n '{key: "BETTER_AUTH_SECRET", value: $ENV.BETTER_AUTH_SECRET, type: "sensitive", target: ["production", "preview"]}' |
  curl --fail-with-body -sS -o "$response" -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @- \
    "$API/v10/projects/$PROJECT/env?upsert=true&teamId=$VERCEL_ORG_ID" || fail_with_code "The upsert"

echo "Upsert answered:"
jq -r '
  ([.created] | flatten | map(select(. != null)) | map("  key=\(.key) type=\(.type) targets=\((.target | if type == "array" then . else [.] end) | join(","))")) as $created
  | ($created | .[]),
    "  failed=\(.failed | length)"
' "$response"
if [ "$(jq -r '.failed | length' "$response")" != "0" ]; then
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

covered="$(jq -r --arg key "$KEY" '
  (.envs // .) | map(select(.key == $key))
  | (map(select(.type == "sensitive") | .target | if type == "array" then . else [.] end) | add // []) as $good
  | (map(select(.type != "sensitive") | .target | if type == "array" then . else [.] end) | add // []) as $bad
  | if (["production", "preview"] - $good | length) == 0 and (($bad | index("production")) == null) and (($bad | index("preview")) == null)
    then "ok" else "bad" end
' "$response")"
if [ "$covered" != "ok" ]; then
  echo "$KEY is not a sensitive variable on both production and preview. Check the project in Vercel." >&2
  exit 1
fi
echo "Done. $KEY is sensitive on production and preview. Other variables unchanged: $after."
