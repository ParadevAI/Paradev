---
name: check-a-flag
description: Answer "is this flag on, for whom, and is it still used" from LaunchDarkly before changing or reasoning about flagged code — find the flag, read what each environment serves and to whom, and check where it is still evaluated. Use when the user asks whether a feature is on, why a customer sees or does not see something, what a flag does, or before editing code that sits behind a flag.
argument-hint: the flag key or name, and the environment or customer it is about
allowed-tools: mcp__launchdarkly__get-projects, mcp__launchdarkly__get-flags, mcp__launchdarkly__get-flag-status-across-envs, mcp__launchdarkly__get-flag-health, mcp__launchdarkly__search-contexts, mcp__launchdarkly__search-change-history, mcp__launchdarkly__get-flag-code-references
---

# Read the flag before you trust the code

The code says what *can* happen behind a flag. LaunchDarkly says what *does*
happen, in which environment, for whom. Answers about flagged behavior come from
the flag, not from the default value in the code.

## 1. Find the right flag in the right project

If the user named no project, find it with `get-projects` (search by query, and
ask when no single project clearly matches). Search flags with `get-flags` and
the key or a name fragment, in the environment the user means. A flag key in
the code is the most reliable handle; display names drift.

## 2. Read what each environment serves

Call `get-flags` with `flagKey` and `env` for every environment that matters.
Read, in order: whether targeting is on (off means everyone gets the off
variation), individual targets, rules top to bottom (the first match wins), then
the default rule. Prerequisites can turn the flag off for everyone regardless
of its own rules.

For "why does this customer see X", find their context with `search-contexts`
and walk it through the prerequisites first: if a prerequisite does not serve
its required variation to this context, the context gets the off variation
whatever the rules say. Then walk the rules and name the one that matched.

## 3. Check whether it is still evaluated

`get-flag-status-across-envs` gives the lifecycle status (new, active, inactive,
launched) and when each environment last evaluated it. `get-flag-health` adds
age and whether the flag is marked temporary. The `default` in the status result
is the fallback the SDK passed, not what the flag serves.

## 4. Check what changed recently

When behavior changed without a deploy, `search-change-history` for the flag
shows who changed its targeting and when. Line it up with the time the user saw
the change.

## 5. Answer per environment

"`new-checkout` is on in production for the `beta` segment (rule 2) and 10% of
everyone else; off in staging; last evaluated in production 3 minutes ago." Say
which environments you checked.

## Anti-patterns

- **Reading the code default as the answer.** The default is only what the SDK
  serves when it cannot reach LaunchDarkly.
- **One environment for all.** Staging and production almost always differ.
- **Skipping prerequisites.** A prerequisite flag that is off overrides every
  rule below it.
