---
name: respond-to-an-alert
description: Work a Datadog monitor alert or incident from the page to a cause — read what the monitor measures and its threshold, confirm the signal is real, correlate it with deploys and other changes, and report impact and next step. Use when a Datadog monitor fires or pages, the user pastes a monitor or incident link, asks why an alert is firing, or is on call and needs to know what is going on.
argument-hint: the monitor or incident link, ID, or name
allowed-tools: mcp__datadog__list_datadog_skills, mcp__datadog__load_datadog_skill, mcp__datadog__search_datadog_monitors, mcp__datadog__search_datadog_incidents, mcp__datadog__get_datadog_incident, mcp__datadog__search_datadog_events, mcp__datadog__get_change_stories, mcp__datadog__get_datadog_metric, mcp__datadog__search_datadog_logs, mcp__datadog__aggregate_spans, mcp__datadog__get_datadog_dashboard
---

# An alert is a question, not an answer

A monitor says a number crossed a line. Before acting, find out what the number
is, whether it moved for a real reason, and what changed.

## 1. Read the monitor, not just its title

Find it with `search_datadog_monitors` (`id:<id>` or `title:<name>`) and read
its query, threshold, evaluation window and the groups that are alerting. A
title like "API errors high" can measure a rate, a count, or one host. For an
incident, `get_datadog_incident` with the timeline gives severity, what
responders already tried and the linked monitors.

## 2. Confirm the signal

Re-run what the monitor measures (`get_datadog_metric` for a metric monitor,
`search_datadog_logs` or `aggregate_spans` for log and APM monitors) over a
window that starts well before the alert. Decide which of these it is:

- **Real change**: the series moved and stays moved.
- **Spike**: it moved and came back; check whether it recurs.
- **Data gap or low traffic**: no data or a tiny denominator tripped a ratio.
- **One group**: a single host, region or tenant; scope the report to it.

## 3. Correlate with changes

`get_change_stories` for the service and `search_datadog_events` with
`source:change_tracking` list deploys, flag changes and infrastructure events in
the window. `source:alert` shows whether related monitors fired first; the
earliest one is usually closer to the cause.

## 4. Report and hand off

Say what the monitor measures, whether the signal is real, what changed just
before it, who is affected, and the next step (roll back, scale, fix, or watch).
Link the monitor and the evidence. Muting a monitor or resolving an incident is
the responder's call; propose it, do not do it to make the page quiet.

## Anti-patterns

- **Trusting the title.** Read the query and threshold.
- **Zooming in on the alert window only.** Without the hours before it, there is
  no baseline.
- **Treating "recovered" as fixed.** A spike that recovers on its own can recur
  at the next peak.
