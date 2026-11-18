#!/usr/bin/env bash
# Model-checks Drive.tla.
#   ./run.sh               the six scenarios with the proposed fixes; every rule must hold
#   ./run.sh CONFIG.cfg    one config, one worker, so a failure prints the shortest trace
#   ./run.sh head          each rule alone against the code at head (the scenarios, fixes off)
#   ./run.sh bugs          each Drive-bug-*.cfg: every fix but one; prints the rule it breaks
#   ./run.sh broken        each Drive-broken-*.cfg must fail the rule it names
set -euo pipefail
cd "$(dirname "$0")"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/tla"
JAR="$CACHE/tla2tools.jar"
if [ ! -s "$JAR" ]; then
  mkdir -p "$CACHE"
  curl -fsSL -o "$JAR.tmp" https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar
  mv "$JAR.tmp" "$JAR"
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SCENARIOS="Drive.cfg Drive-rearchive.cfg Drive-race.cfg Drive-boot.cfg Drive-env.cfg Drive-twoprov.cfg"
RULES="NoWorkLost NeverEmptyShownAsWork SingleWriter NoTeardownOfLive NoDriveUnchanged
  NoStuckForever FreshForkIsFetched TransientIsRetried NoOrphanForever DriveOnlyByProvision"

# tlc CONFIG WORKERS: prints TLC's output.
tlc() {
  local meta
  meta="$(mktemp -d "$TMP/meta.XXXX")"
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers "$2" -metadir "$meta" -config "$1" Drive.tla 2>&1 || true
}
states() { grep -o '[0-9,]* distinct states found' | tail -1; }
violated() { grep -oE '(Invariant|Temporal properties|Action property) [A-Za-z]* ?(is )?violated|Temporal properties were violated' | head -1; }
trace() { grep -E '^State [0-9]+: <' | sed -E 's/^State ([0-9]+): <([A-Za-z0-9]+).*/    \1 \2/'; }
# Many workers to search, then one worker again on a failure for the shortest trace.
check() {
  local out
  out="$(tlc "$1" auto)"
  if grep -q "No error has been found" <<<"$out"; then echo "pass ($(states <<<"$out"))"; return 0; fi
  out="$(tlc "$1" 1)"
  echo "FAILS: $(violated <<<"$out")"
  trace <<<"$out"
  return 1
}
only_rule() {  # only_rule CONFIG RULE OUT
  local check="INVARIANTS $2"
  [ "$2" = DriveOnlyByProvision ] && check="PROPERTIES $2"
  awk -v check="$check" '/^INVARIANTS|^PROPERTIES/ { skip = 1 } /^SYMMETRY/ { skip = 0; print check } !skip' \
    "$1" > "$3"
}
head_of() { sed -E 's/(FixOneProvision|HasSweep) = TRUE/\1 = FALSE/g' "$1"; }

case "${1:-}" in
  "")
    failed=0
    for cfg in $SCENARIOS; do echo "$cfg: $(check "$cfg" || echo)"; done | tee "$TMP/log"
    ! grep -q FAILS "$TMP/log"
    ;;
  head)
    for rule in $RULES; do
      result="holds"
      for cfg in $SCENARIOS; do
        head_of "$cfg" > "$TMP/h.cfg"
        only_rule "$TMP/h.cfg" "$rule" "$TMP/head-$rule-$cfg"
        if ! out="$(check "$TMP/head-$rule-$cfg")"; then result="FAILS in $cfg"$'\n'"$(tail -n +2 <<<"$out")"; break; fi
      done
      echo "$rule: $result"
    done
    ;;
  bugs)
    for cfg in Drive-bug-*.cfg; do echo "$cfg: $(tlc "$cfg" 1 | { o="$(cat)"; if grep -q "No error" <<<"$o"; then echo "no failure ($(states <<<"$o"))"; else echo "$(violated <<<"$o")"; trace <<<"$o"; fi; })"; done
    ;;
  broken)
    status=0
    for cfg in Drive-broken-*.cfg; do
      rule="${cfg#Drive-broken-}"; rule="${rule%.cfg}"
      out="$(tlc "$cfg" 1)"
      if grep -q "No error has been found" <<<"$out"; then echo "$cfg: PASSED, the check no longer exercises $rule"; status=1
      else echo "$cfg: fails $rule in $(trace <<<"$out" | wc -l) states"; fi
    done
    exit "$status"
    ;;
  *) tlc "$1" 1 ;;
esac
