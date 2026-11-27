---
name: standup
description: Digest of what the user's Paradev (formerly Superset) agents did while they were away, sweeping workspaces, tasks, and agent terminals to report what finished, what needs review, and what's blocked. Use when the user asks "what did my agents do", "what happened while I was away", wants a standup or summary of agent work, or returns after a break.
argument-hint: optional timeframe or project
allowed-tools: Bash(superset:*) Bash(paradev:*) Bash(bash ${CLAUDE_SKILL_DIR}/scripts/sweep.sh *)
---

# Paradev Standup

If `paradev` is not found, run the same command as `superset`, or update the CLI.

Answer "what happened while I was away?" from real state, not guesses. Entirely read-only.

Use the Paradev MCP tools when they are in your tool list (a chat host such as Claude.ai or ChatGPT with the Paradev connector), and the `paradev` CLI otherwise. Steps marked local-only need the paradev CLI on this machine.

With the MCP tools, the sweep in step 1 is:

1. `tasks_list` with `assigneeMe: true` for the user's tasks, or no filter for all of the organization's tasks.
2. `workspaces_list` with no arguments for cloud workspaces and their `status`. For workspaces on a machine, call `hosts_list` first and pass a host's `id` as `hostId`.
3. Per workspace, `terminals_list` with `workspaceId` (and `hostId` for a host workspace), then `terminals_read` with `workspaceId`, `terminalId` and `maxLines: 60` for each agent terminal.

`scripts/sweep.sh`, `workspaces pull-requests` and `workspaces activity` are local-only.

## 1. Sweep

Run `bash scripts/sweep.sh` from this skill's directory (`bash ${CLAUDE_SKILL_DIR}/scripts/sweep.sh` in Claude Code). It lists workspaces and tasks, then for each workspace lists its terminals and reads the last screen of every agent terminal, tolerating individual failures. Pass `--host <id>` to sweep a remote host, `--max-lines <n>` to change the per-terminal tail (default 60).

If the script can't run (no bash, no `jq`), do the same by hand: `paradev workspaces list --local --json`, `paradev tasks list --json`, then per workspace `paradev terminals list --local --workspace <id> --json` and `paradev terminals read --local --workspace <id> --terminal <terminalId> --max-lines 60`.

The last screen of a terminal shows whether the agent finished, asked a question, or errored.

Cloud workspaces: `paradev workspaces list --json` gives each one's `status` and `agentStatus`, `paradev workspaces pull-requests --all --json` shows the pull requests they opened, and `paradev workspaces activity <id>` gives one's timeline. These read the API and do not wake a sleeping sandbox.

## 2. Classify each workspace

- **Needs you**: agent finished and awaits review, asked a question, or hit a permission prompt or failure
- **In flight**: actively working
- **Blocked**: waiting on something external
- **Stale**: idle with no pending work, a candidate for cleanup

## 3. Report

Lead with what needs the user, one line per item: workspace, agent, state, and the next action. Then in-flight, then completed, then stale-workspace cleanup suggestions. Keep the whole digest scannable: no terminal dumps, quote at most the single relevant line an agent printed.

Offer the digest as a page when someone other than the user will read it, or when they want it
to persist past the scrollback. Write the report you just composed to an `.html` file inside a
workspace, then publish that file: the CLI publishes a document, not your terminal output.

```bash
paradev pages publish standup.html --workspace <id> --title "Standup" --label "what shipped overnight"
```

With the MCP tools, pass the HTML text to `pages_publish` as `html`, with `title` and `label`.

Publishing the same file from the same workspace each morning versions one page instead of
scattering a new one daily, so the history becomes the record of the week. A digest often runs
from outside any workspace, and a publish with no workspace is refused, so pass `--workspace`
explicitly. Offer it; never publish one unasked.

## Rules

Never send input to a terminal, modify tasks, or clean anything up as part of the digest. Offer those as follow-ups and act only when asked.
