---
name: verify-a-deploy
description: Check in Datadog that a change you shipped works in production before you call the task done — compare error rate, latency and new error kinds before and after the deploy, confirm the targeted error stopped, and catch regressions early. Use after merging or deploying a fix or feature, when the user asks whether a deploy is healthy, did the fix work, or is it safe to move on.
argument-hint: the service, deploy time or version, and the error or behavior the change should affect
allowed-tools: mcp__datadog__list_datadog_skills, mcp__datadog__load_datadog_skill, mcp__datadog__get_change_stories, mcp__datadog__search_datadog_events, mcp__datadog__aggregate_spans, mcp__datadog__analyze_datadog_logs, mcp__datadog__search_datadog_logs, mcp__datadog__get_datadog_metric, mcp__datadog__search_datadog_monitors
---

# A task is done when production says so

Tests passing and a green deploy say the code runs. Only production telemetry
says it did what it was meant to and broke nothing else.

## 1. Pin the deploy

Find the deploy time and version with `get_change_stories` (story type
`deployment`) or `search_datadog_events` with `source:change_tracking`. If the
service tags telemetry with `version:`, compare by version; otherwise compare
equal windows before and after the deploy time. Wait until the new version
carries real traffic.

## 2. Check the thing the change targeted

If the change fixed an error, count that error before and after
(`analyze_datadog_logs` or `aggregate_spans` filtered to it). It should drop to
zero, or to the rate the fix claimed. If the change added a feature, find its
logs or spans and confirm they appear with the expected shape.

## 3. Check for what it broke

For the service as a whole, compare before and after:

- Error rate and request count by `resource_name` (`aggregate_spans`).
- P95 latency on the endpoints the change touched.
- New error kinds that did not exist before the deploy.
- Monitors on the service now alerting (`search_datadog_monitors`).

`source:deployment_analysis` events show versions Datadog itself flagged as
regressing.

## 4. Report the verdict

One line per check, with the numbers: "Targeted error: 412 → 0 per hour. Error
rate 0.8% → 0.7%. P95 on /checkout 240 → 250 ms. No new error kinds." Then say
whether the task is done, needs watching, or needs a rollback.

## Anti-patterns

- **Checking too early.** A deploy with no traffic on the new version has no
  evidence yet.
- **Comparing unequal windows.** Night against day traffic is not a regression.
- **Only checking the fixed error.** The regression is usually somewhere else.
