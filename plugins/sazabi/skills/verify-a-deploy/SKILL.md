---
name: verify-a-deploy
description: Check in Sazabi that a change you shipped works in production before you call the task done — compare error rates and new kinds of log lines before and after the deploy, confirm the fixed error stopped, and catch regressions early. Use after merging or deploying a fix or feature, when the user asks whether a deploy is healthy, did the fix work, or is it safe to move on.
argument-hint: the service, deploy time or commit, and the error or behavior the change should affect
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# A task is done when production says so

Tests pass on the code you wrote. Production runs it against real traffic,
real data and real dependencies. Before you tell the user a fix shipped, check
that it changed what it was meant to change and nothing else.

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).
Questions about logs go to `sazabi/logs.ask`.

## 1. Pin down the deploy

Find when the change went live: the deploy time, or the first log line that
carries the new version or commit. Every comparison below is "before that
moment" against "after it". If the change is not live yet, say so and stop.

## 2. Did the change do its job?

Ask one question for the thing the change should affect, over a window on each
side of the deploy:

- A fix: "how many times did `<the error>` occur per 10 minutes, 3 hours before
  and after <deploy time>". It should drop to zero, not just fall.
- A feature: "how many requests reached `<new endpoint or log line>` since
  <deploy time>, and how many failed". Zero traffic means it is not wired up yet.
- A performance change: ask for the latency or duration the logs record, per
  interval, on both sides.

## 3. Did it break anything else?

Ask for an overview of what is new or growing since the deploy. Look at each
new kind of error line and decide if this change could cause it. Check
`sazabi/issues.search` for issues first seen after the deploy.

## 4. Report

Say whether it is verified, how (the questions you asked and the numbers on
each side), and what is still unknown, for example a code path no traffic has
hit yet. If something regressed, say so first, with the log lines.

## Anti-patterns

- **Calling it done because CI passed.** CI never saw production traffic.
- **Checking too soon.** Five minutes of low traffic can hide a 1% error rate.
  Say how much traffic the window covered.
- **Comparing unequal windows.** Compare the same length of time, at a similar
  time of day.
