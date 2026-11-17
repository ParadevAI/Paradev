---
name: triage-issues
description: Work through the issues Sazabi opened on its own — rank them by severity and blast radius, find each one's cause in this repository with log evidence, and propose or draft one fix per issue, leaving issues open until a fix ships. Use when the user asks what is broken, what to fix first, to clean up or triage Sazabi issues, or for an on-call or morning review.
argument-hint: optional project, service, or severity to focus on
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# Fix the right issue first

Sazabi opens issues when it sees new or growing errors. A long list is not a
plan. The job is to pick the issues that matter, tie each to code in this
repository with evidence, and leave the user with a short ranked list of fixes.

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).
List open issues with `sazabi/issues.search`; search for other issue operations (reading one issue, changing its status) before assuming they exist.

## 1. Rank before you read

Pull open issues, then rank by impact, not by age or title:

1. Severity Sazabi assigned.
2. Volume now against before: is it growing?
3. Who it hits: customers, a paying tenant, a critical path (sign-in,
   checkout), or an internal job.
4. Whether this repository owns the failing code. Issues in services you don't
   own get a one-line note and a pointer, not an investigation.

Group issues that share a cause; three issues from one bad deploy are one
item.

## 2. One issue at a time, with evidence

For the top few, ask `sazabi/logs.ask` for the failing lines and their
neighbors, find the first frame or log line this repository emits on that
path, and read that code. Check `sazabi/search.threads` for an earlier
investigation before starting over.

Name one cause per issue, and say how sure you are. "Unknown, here is what
would tell us" is a valid finding.

## 3. Propose fixes, don't hide issues

For each issue write: cause, fix, risk, and how to verify it after deploy. Draft
the code change if the user asked. Leave issues open until the fix is live and
the errors have stopped; closing an issue to make the list shorter erases the
signal that would catch a regression.

## 4. Report

A ranked list: issue, impact, cause, proposed fix, confidence. Put anything
that needs a human decision (data repair, customer contact) at the top.

## Anti-patterns

- **Triage by title.** Two issues with one message can be two bugs; two
  messages can be one bug.
- **Fixing the noisiest issue.** Volume is not impact; a quiet failure in
  checkout beats a loud retry warning.
- **Resolving without a shipped fix.**
