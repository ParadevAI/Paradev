---
name: add-logging
description: Before shipping a change, add structured log lines to the code path it touches so the next investigation has evidence — one line per decision and failure, with stable event names and the IDs needed to join requests, at the right level and without secrets. Use when writing or reviewing a feature or fix, when a bug was hard to diagnose because the logs were silent, or when the user asks to improve logging or observability in code.
argument-hint: the change, file, or code path to cover
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# Log what you will need to ask about

Every investigation in Sazabi is limited by what the code logged. The cheapest
time to add the right lines is while the change is fresh. The job is a small
number of structured lines that answer "what happened to this request, and
why".

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).

## 1. Match what is already there

Read how this repository logs: which logger, which field names, how request and
trace IDs are attached. Ask `sazabi/logs.ask` for a sample of this service's
recent lines to see the real shape. New lines must look like their neighbors;
an investigation that has to join two naming schemes is slower.

## 2. Pick the lines

On the changed path, log:

- **Failures** with the error, the input that caused it (IDs, not payloads),
  and what the code did next (retry, fallback, give up).
- **Decisions** that change behavior: a feature flag, a fallback, a skipped
  step, a limit hit.
- **Boundaries**: calls to other services or queues, with target, outcome and
  duration.

Skip lines that restate the obvious ("entering function").

## 3. Shape each line

- A stable event name (`checkout.payment_declined`), so a question can count
  it.
- Structured fields, not values glued into the message string.
- IDs that join the story: request or trace ID, user or tenant ID, order ID.
- The right level: ERROR for failures someone must act on, WARN for degraded
  but handled, INFO for decisions, DEBUG for detail that is off in production.
- Never secrets, tokens, passwords or full personal data. Redact or omit.

## 4. Check it

Run the path locally or in tests and read the lines it emits. After deploy, ask
Sazabi for the new event name to confirm the lines arrive with their fields.

## Anti-patterns

- **Logging payloads.** They leak data and cost money; log IDs and sizes.
- **ERROR for expected outcomes.** A declined card is INFO; an ERROR should
  mean a broken system.
- **Many lines per request in a hot loop.** Log the summary, not every
  iteration.
