# Superset's own inbox cards

Five first-party cards for things that happen inside Superset. Each resolves live on the cloud API from
Superset's own tables and from the workspace's host, and each acts through paths Superset already has.

The two tiers of card, the local "agent finished", and who may answer a card are in
`plans/superset-cards-parity.md`.

| Card | Type | Refs | Who places it | Actions |
| --- | --- | --- | --- | --- |
| Agent finished | `superset.agent_finished` | `workspace`, `host?`, `agent?` | the agent (`superset inbox push`) | Send back (feedback), Archive (cloud only, confirmed); Open workspace is a link |
| Agent needs you | `superset.agent_needs` | `need` + `workspace?`, `host?`, `service?`/`scope?`, `tool?`, `question?` | the agent | credential: Connected / Not granting; tool: Approve / Deny; question: answered in the card through its ask question |
| Review comments | `superset.pr_review` | `workspace`, `host?`, `agent?` | Superset only: the GitHub `pull_request_review.submitted` webhook | Reply, Resolve (the card stays open), Address with agent (optional note) |
| Task assigned | `superset.task_assigned` | `task` | Superset only: `task.create` and a reassignment in `task.update` | Start with an agent (the task page's run-in-workspace picker), recorded as `started`; Open task is a link |
| Automation failed | `superset.automation_failed` | `run` | Superset only: scheduled and event dispatch, and the delivery-failure callback | Retry (owner, plan); Open run opens the run's workspace and terminal, or the run history when it never started |

`credential.request` folds into `superset.agent_needs` (`need: "credential"`); the inbox is unreleased, so
the old type is removed rather than aliased.

## Server-pushed cards

`pushSystemCard` upserts a card with `agentSessionId = "superset:<source>"`, no sender, a one-block
document, and a key per subject (`automation-failed:<automation>`, `task-assigned:<task>:<user>`,
`pr-review:<repo>:<pr>:<workspace>`). It matches only rows with no sender in the same organization, and a
resolved card under the same key reopens. Producers await the push and never fail on it.

Agents may not push under `superset:` (`pushCardSchema` refuses it), and the three Superset-only types are
`systemOnly`: on a card an agent wrote they render unavailable and refuse actions.

What counts as news:

- review: changes requested, or a commented review with a body; not the PR author's own reviews (their
  thread replies, and the agent's), not fork heads. Only cloud workspaces: local workspaces live on their
  hosts, so a webhook cannot find them.
- task: someone else assigned it, after the write commits; edits to an assigned task push nothing.
- automation: `dispatch_failed` or `skipped_offline` from a scheduled or event run; one card per
  automation follows its latest failure. A manual run shows its error where it was started.

## Reaching the workspace

Local workspaces exist only on their host. A card names the host (`host`, else the machine that pushed
the card), and `callWorkspaceHost` reaches it through the relay with a five-minute JWT for the reader;
the relay checks the reader's access to that host. Cloud workspaces are woken and called with the
sandbox secret. Errors map to plain card states; details go to the server log.

Workspace and PR facts come from the same host reads the sidebar makes (`workspace.get`,
`pullRequests.getByWorkspaces`); review threads from `git.getPullRequestThreads`, the Review tab's call,
so replies and resolves go out with that machine's GitHub account.

"Send back" continues the card's own agent session (`continueTerminalId = card.agentSessionId`) unless
the agent is blocked in `superset inbox wait`, in which case the feedback is the wait's outcome.
"Address with agent" starts a new session with the open threads as the prompt.

Actions see the card through `CardContext.card` (`id`, `agentSessionId`, `workspaceId`, `hostId`,
`waiting`, `fromSuperset`). Every resolve and action first checks the reader is still a member of the
card's organization.

## Views

Each card renders with the desktop's existing pieces: the sidebar's cloud and local rows and the hover
card content, the PR status badge and diff stats, the presence stack, the PR page's comment thread, the
task row with status, priority and labels, the run-in-workspace picker, and the automation run status
and error guidance.
