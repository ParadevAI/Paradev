---
name: investigate-production
description: Find out what is actually happening in production from Sazabi's logs, traces and issues before touching code — ask the logs a precise question, read the lines behind the answer, and separate the symptom from its cause. Use when the user reports a production error, a slow or failing endpoint, a customer complaint, an alert, or asks what is broken, what changed, or why something stopped working.
argument-hint: the symptom, endpoint, error message, or Sazabi link to investigate
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# Investigate with the logs, not the guess

Sazabi stores your logs, traces and metrics and answers questions about them.
The job is to turn "something is broken" into a claim about *what* fails, *why*,
and *who* it hits, backed by real log lines, before anyone edits code.

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).

Most operations work on one project. If the user did not name one and more
than one exists, ask which, or pick the one whose name matches this repository.

## 1. Start from what is already known

Run `sazabi/issues.search` for the symptom. Sazabi opens issues on its own when
it sees new or growing errors, so the bug may already have a title, a severity,
and a first-seen time. Then run `sazabi/search.threads` for the same words: a
teammate or the Sazabi agent may already have investigated it.

Treat search hits as candidates. Match on the error and the code path, not on
title similarity.

## 2. Ask the logs one precise question at a time

`sazabi/logs.ask` takes a question in plain language and returns an `answer`,
an `explanation` of what it measured, the `window`, and a `queryId`.

- **Open with an overview** when you do not know where to look yet: "what is
  broken in the last hour", "what changed since yesterday's deploy". It returns
  the kinds of log lines in the window, with counts against the window before
  and example lines.
- **Then narrow** to questions with one answer: "how many 5xx did
  POST /api/checkout return per 5 minutes over the last 6 hours", "which
  customer IDs saw `PaymentTimeout` today", "show the 20 most recent lines for
  trace id abc123".
- Read `explanation` and `window` every time. An answer over the wrong service,
  window or field is confidently wrong.

## 3. Read the lines, then the code

Pull the actual log lines for the failure, including the requests just before
it. Find the first line this repository emits on the failing path, then open
that code in the working tree. Production runs a release: check the version or
commit in the logs against the branch before you trust line numbers.

Before you propose a cause, check what the failures have in common: one
endpoint, one tenant, one region, one release, one upstream? A failure scoped
to a dimension names its own trigger. A failure that starts at a deploy points
at that deploy's diff.

## 4. Report cause, scope, and blast radius

Write three sentences: what fails, why, and who it hits (volume, affected
customers, since when). Quote the log lines and the question you asked, so the
user can rerun it. Only then, if asked, fix the code you found.

## Anti-patterns

- **Fixing the first error you see.** The loudest line is often a downstream
  retry, not the cause.
- **One overview, no follow-up.** An overview finds where to look; it is not the
  evidence.
- **Trusting an answer without its window.** "No errors" over the last 5
  minutes says nothing about the outage an hour ago.
- **Pasting secrets from logs.** Log lines can hold tokens and personal data.
  Quote only what the finding needs.
