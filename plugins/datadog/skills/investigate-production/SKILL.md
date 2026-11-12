---
name: investigate-production
description: Find out what is actually failing in production from Datadog's logs, traces and metrics before touching code — scope to the right service and environment, rank errors with aggregates, read the traces behind them, and separate the symptom from its cause. Use when the user reports a production error, a slow or failing endpoint, a customer complaint, or asks what is broken, what changed, or why something stopped working.
argument-hint: the service, endpoint, error message, or customer report to investigate
allowed-tools: mcp__datadog__list_datadog_skills, mcp__datadog__load_datadog_skill, mcp__datadog__search_datadog_entities, mcp__datadog__search_datadog_logs, mcp__datadog__analyze_datadog_logs, mcp__datadog__search_datadog_spans, mcp__datadog__aggregate_spans, mcp__datadog__get_datadog_trace, mcp__datadog__get_datadog_metric, mcp__datadog__search_datadog_metrics, mcp__datadog__get_change_stories, mcp__datadog__search_datadog_sdk, mcp__datadog__execute_code
---

# Evidence first, then the fix

Datadog holds the record of what production did. The job is to turn a report
("checkout is broken") into a claim backed by that record — what fails, why, and
for whom — before anyone edits code.

## 1. Load Datadog's own guidance

The server ships skill guides for query syntax, attribute names and pitfalls.
Run `list_datadog_skills` with the topic (logs, traces, metrics) and
`load_datadog_skill` for each one that matches, before the first query. Where
`execute_code` is offered, the server prefers one script that makes several API
calls over many single-tool calls; find each operation with
`search_datadog_sdk` rather than guessing method names.

## 2. Scope to one service and one environment

Name the service as Datadog knows it: `search_datadog_entities` with
`entity_type: service` resolves a name to the catalog entry, its owner and its
dependencies. Pin `env:` (production noise and staging noise answer different
questions) and a time window that starts before the report. Say which service,
environment and window you searched.

## 3. Rank before you read

Counts come from aggregates, not from scrolling samples:

- Errors by kind or route: `analyze_datadog_logs` (SQL over the logs table) or
  an aggregate in `execute_code`.
- Latency and error rate by endpoint: `aggregate_spans` grouped by
  `resource_name`, with `P95` over `@duration`.
- Request totals and ratios: the `trace.*` metrics, because indexed spans are a
  sample kept by retention filters.

Pick the one or two error shapes that carry the volume, and check when each
started.

## 4. Read the evidence behind the top answer

For the leading error, read a few raw log lines (`search_datadog_logs`) and one
full trace (`get_datadog_trace`). Walk the trace to the first span that failed,
not the root span that reported it, and cross-check the code path against the
working tree: production runs a deployed version, and the line numbers may
belong to code that has since changed.

## 5. Check what changed

`get_change_stories` lists deploys, feature flag changes, Kubernetes events and
schema changes for the service. An error that starts at a deploy points at that
diff; one that grows slowly points at data or traffic.

## 6. Report cause, scope, and blast radius

Three sentences: what fails, why, and who it hits (requests or users affected,
since when). Link the logs, trace or dashboard you used. Fix only once the cause
is named.

## Anti-patterns

- **Counting samples.** Grouping fifty returned log lines is not a ranking; use
  an aggregate.
- **Fixing the reporting span.** The span that logged the error is often three
  calls above the one that failed.
- **Searching without `service` and `env`.** A broad query returns a confident
  answer about the wrong system.
- **Guessing attribute names.** An unknown facet returns nothing rather than an
  error; discover fields first.
