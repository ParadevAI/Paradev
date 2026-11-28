---
name: automate
description: Turn a recurring chore into a Paradev (formerly Superset) automation. Drafts the agent prompt, confirms the schedule or event trigger and the target, creates it with the CLI, and reviews the first run together. Use when the user wants a scheduled or recurring agent, a daily or weekly job, or an agent that reacts to a Slack message, GitHub pull request, Linear issue, Sentry issue or incoming email, or says things like "every morning do X", "automate this", "set up a cron agent", "run this on a schedule", "when someone opens a PR, do X".
argument-hint: describe the recurring task
allowed-tools: Bash(superset:*) Bash(paradev:*)
---

# Paradev Automate

If `paradev` is not found, run the same command as `superset`, or update the CLI.

Turn "I keep doing X every morning" into an automation that does X on a schedule, or "someone should look at every new PR" into one that fires on the event.

Use the Paradev MCP tools when they are in your tool list (a chat host such as Claude.ai or ChatGPT with the Paradev connector), and the `paradev` CLI otherwise. Each step names both. Steps marked local-only need the paradev CLI on this machine.

To answer "what did automation X do": `automations_list` with `name: "X"` gives its `id`, then `automations_logs` with `automationId` (and `limit`, default 20) lists its runs newest first, each with `status`, `error` and `title`. CLI: `paradev automations list`, then `paradev automations logs <id>`.

## 1. Understand the chore

Pin down: the outcome, the cadence, the inputs it reads, and what "done" looks like. Then draft the automation prompt as instructions for an agent with zero context. If the task has rules that will evolve (triage criteria, formats), put them in a document the automation reads at runtime so they can be edited without touching the prompt.

Nobody watches a run, so a chore whose product is a digest, a report, or a scorecard needs somewhere for that product to land. End the prompt by writing the report to an `.html` file and publishing it, so the user opens one link instead of digging through run logs.

```
...write the digest to digest.html, then publish it:
paradev pages publish digest.html --title "Nightly triage" --label "what changed today"
```

A page is identified by its workspace plus its path, so **which target you picked in step 2 decides whether history accumulates**. A project target creates a fresh workspace per run, which means a new page every run rather than a new version of one. For a report meant to build up history, use a workspace target, or capture the page id from the first run and have the prompt pass `--page <id>` from then on.

## 2. Pick the target

- `paradev projects list`: a project target creates a fresh workspace per run (most tasks)
- `paradev workspaces list --local`: a workspace target reuses the same workspace every run (stateful tasks)
- `paradev environments list`: finds an environment id; pass it to `automations create --environment <id>` to start each run in a fresh cloud workspace, so runs do not need this machine awake

MCP: `projects_list` and `workspaces_list` with a host need a `hostId`, so call `hosts_list` first and ask the user which host when there is more than one. `workspaces_list` with no `hostId` lists cloud workspaces. Finding an environment id is local-only.

## 3. Pick what fires it

A clock or an event. Ask which the chore actually wants: "every morning" is a schedule, "whenever someone does X" is an event trigger.

For an event trigger, resolve the ids first. A scope stores provider ids, never names, so a channel name or repo title written straight into a config matches nothing:

```bash
paradev automations trigger-options --group slack
```

MCP: `automations_trigger_options` with `group: "slack"`.

Groups: `slack`, `github`, `linear`, `sentry`, `notion`, `microsoftTeams`, `google` (Gmail labels and people). An empty result is ambiguous: the org has not connected that group, or its token was revoked, or the provider failed the lookup. Ask the user to check the connection in Settings rather than telling them it is not connected.

Then write the set to a file. Every filter is a scope: `{"mode":"any"}` matches everything, `{"mode":"list","ids":[...]}` matches those ids, `{"mode":"me"}` resolves to the automation owner's account at that provider.

```json
[
  {
    "config": {
      "kind": "slack",
      "event": "reaction_added",
      "channels": { "mode": "list", "ids": ["C0123456789"] },
      "emoji": { "mode": "list", "ids": ["bug"] },
      "actor": { "mode": "any" }
    }
  }
]
```

## 4. Confirm before creating

Show the user (use the ask_user tool if available): the name, what fires it (the RRULE, or the event and the scopes in plain words), the agent, the target, and the exact command you will run. Never create without explicit confirmation.

## 5. Create and shake down

```bash
paradev automations create \
  --name "Daily issue triage" \
  --rrule "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" \
  --timezone America/Los_Angeles \
  --project <id> \
  --agent claude \
  --prompt-file /tmp/automation-prompt.md
```

For an event trigger, swap `--rrule` and `--timezone` for `--triggers-file`:

```bash
paradev automations create \
  --name "Triage bug reactions" \
  --triggers-file /tmp/triggers.json \
  --project <id> \
  --agent claude \
  --prompt-file /tmp/automation-prompt.md
```

MCP: `automations_create` with `name`, `prompt` (the text, not a file), `agent`, and either `rrule` with `timezone` or `triggers` (the same array as the file). Pass `v2ProjectId` for a project target, `v2WorkspaceId` with `targetHostId` for a workspace target, `targetHostId` to pick the host, or `targetHostId: "cloud"` with `environmentId` for a cloud run.

(`--workspace <id>` instead of `--project` for reuse mode; `--host <id>` if it should run on another machine; prefer `--prompt-file` for multiline prompts. One automation can hold both kinds: put the schedule in the trigger set alongside the event.)

**Changing triggers later replaces the whole set.** `paradev automations update <id> --triggers-file` deletes every trigger you leave out. Read the current set with `paradev automations get <id>` (MCP: `automations_get` with `id`) and resend the entries you are keeping, each with its `id`, so they are updated in place rather than recreated. MCP: `automations_update` with `id` and `triggers`. Recreating rolls a webhook's signing key and resets a schedule's next run.

Always confirm the trigger actually landed: run `paradev automations get <id>` after the write and check the `triggers` array. Do not report a trigger as set up on the strength of the command exiting 0.

Then trigger a first run now with `paradev automations run <id>`, review `paradev automations logs <id>` with the user, and refine the prompt via `paradev automations prompt set <id>` until the run output is right. MCP: `automations_run` with `id`, `automations_logs` with `automationId`, and `automations_set_prompt` with `id` and `prompt`. An automation isn't done until one real run looked good. If the prompt publishes a page, open the published page as part of that review, not just the run log.
