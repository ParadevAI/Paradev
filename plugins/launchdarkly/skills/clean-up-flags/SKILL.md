---
name: clean-up-flags
description: Remove feature flags nothing needs anymore, in the safe order — find stale candidates, prove each is unused or fully launched everywhere, delete the flag from the code first, and archive it in LaunchDarkly only after that code is deployed. Use when the user asks to clean up, remove or retire feature flags, reduce flag debt, or remove one specific flag.
argument-hint: a flag key to remove, or a project to sweep for stale flags
allowed-tools: mcp__launchdarkly__search-stale-flags, mcp__launchdarkly__get-flags, mcp__launchdarkly__get-flag-status-across-envs, mcp__launchdarkly__get-removal-readiness, mcp__launchdarkly__get-flag-code-references, mcp__launchdarkly__archive-flag
---

# Code first, flag last

A flag removed from LaunchDarkly while code still evaluates it falls back to the
code's default, everywhere, at once. The order that never breaks production is:
prove it is unused, remove it from the code, deploy, then archive the flag.

## 1. Find candidates

For a sweep, `search-stale-flags` ranks candidates: never requested, inactive
beyond a threshold, or launched with no recent changes. For one named flag,
start from it.

## 2. Decide what the code should keep

For each flag, `get-flag-status-across-envs` with `allEnvs: true` and `get-flags`
per environment answer the only question that matters for the code change: which
variation does every user get today?

- **Launched**: everyone gets the same variation everywhere. Keep that branch.
- **Inactive or never requested, serving one variation everywhere**: no recent
  evaluations, which is not proof that nothing calls it; a rarely run path can
  still need it. Keep that variation, and delete the code path only once step 4
  shows nothing reaches it.
- **Anything else** (rules, rollouts or targets that serve different
  variations, whatever the status): not a cleanup candidate. Say so and stop.

## 3. Check readiness

`get-removal-readiness` in each environment checks dependent flags,
prerequisites, code references, active targeting and expiring targets. A
`blocked` verdict stops the removal; `caution` needs its warnings read out to
the user.

## 4. Remove it from the code

Search the repository for the flag key, not just its constant name (string
keys, config files, tests). `get-flag-code-references` lists the other
repositories that still reference it; an empty result is not proof, because only
scanned default branches count. Keep the winning branch, delete the other one
and the flag check, and open the change for review.

## 5. Archive after the deploy

Only once the code without the flag is deployed everywhere it runs, call
`archive-flag`. Archiving is reversible. Leave permanent deletion to a person.

## Anti-patterns

- **Archiving first.** It turns a cleanup into an outage for every service still
  evaluating the flag.
- **Keeping the wrong branch.** Read what production serves, not what the
  flag's name suggests.
- **Trusting one repository.** Other services may evaluate the same key.
