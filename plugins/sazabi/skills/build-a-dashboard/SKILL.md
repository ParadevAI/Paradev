---
name: build-a-dashboard
description: Turn a question the user keeps asking about production (error rates, latency, signups, cost) into a saved Sazabi dashboard built from live log queries — check the fields exist, validate before saving, and confirm every panel returns data. Use when the user asks for a dashboard, a recurring view or report, or says they keep checking the same numbers.
argument-hint: what the dashboard should show, and for which service or project
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# A dashboard is a saved question

A Sazabi dashboard is a page of live panels, each running a log query when the
dashboard opens. Build one for questions that come back every day or every
deploy; answer one-off questions with `sazabi/logs.ask` instead.

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).
Dashboard operations: `sazabi/dashboards.list`, `.get`, `.validate`, `.create`, `.update`, `.render`, `.delete`.

## 1. Check what exists

Run `sazabi/dashboards.list`. Every project has built-in dashboards (issues and
alerts, log health) that can't be edited but can be copied. If a close match
exists, propose editing or copying it rather than adding another.

## 2. Find the real fields

Pin down each panel as a question with a number: "error lines by service per
15 minutes", "p95 request duration by route". Use `sazabi/logs.ask` to confirm
the logs actually carry the fields each panel needs (service, route, duration,
event name). If a signal isn't in the logs, leave that panel out and say what
would provide it, for example the `add-logging` skill. Never invent a field.

## 3. Write, validate, save

A dashboard is one MDX document: a `DashboardMeta` block (title, description,
default time range) and a grid of panels, each with an inline log query. A
panel's query never names a time range; the dashboard supplies it. Copy the
document shape from `dashboards.validate` and from an existing dashboard via
`dashboards.get`.

Run `sazabi/dashboards.validate` and fix every diagnostic (each names its line
and a repair hint), then `sazabi/dashboards.create`. Generate the dashboard id
yourself and reuse it if you retry. To change a dashboard, `dashboards.get` it,
edit the whole document, and `dashboards.update` with the edit base it returned.
If the update is rejected because someone saved a newer revision, re-read and
re-apply; don't overwrite.

## 4. Prove it renders

Run `sazabi/dashboards.render` over the default window and check every panel
returns ok, not empty or rejected. Fix or drop panels that don't. Reply with the
dashboard link and one line per panel.

## Anti-patterns

- **Twenty panels.** Five panels that answer the question beat twenty that
  don't.
- **Deleting shared dashboards.** A delete removes it for the whole project and
  can't be undone; ask first.
- **Shipping an empty panel.** A panel that renders "No data" on day one
  teaches people to ignore the dashboard.
