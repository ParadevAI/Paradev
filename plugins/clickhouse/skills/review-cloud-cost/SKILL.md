---
name: review-cloud-cost
description: Explain ClickHouse Cloud spend from the billing data — total and daily cost by service and kind, what changed and when, and which change to make — without guessing at prices. Use when the user asks what ClickHouse costs, why the bill went up, which service is the most expensive, or how to cut ClickHouse Cloud spend.
argument-hint: the period to review (for example last month), and the service if one
allowed-tools: mcp__clickhouse__get_organizations, mcp__clickhouse__get_organization_cost, mcp__clickhouse__get_services_list, mcp__clickhouse__get_service_details
---

# Read the bill before proposing savings

`get_organization_cost` returns the grand total and daily per-entity cost
records for up to 31 days at a time. Every claim about spend comes from those
records; every recommendation names the entity and the day it is based on.

## 1. Pull the period

Get the `organizationId` from `get_organizations`, then call
`get_organization_cost` with `from_date` and `to_date` (`YYYY-MM-DD`). For a
longer period, make one call per 31-day window and add them up. Pull an equal
earlier window as the baseline.

## 2. Break it down

Group the daily records by entity (service, ClickPipe, backup storage, data
transfer) and by kind of charge (compute, storage, transfer), then rank by cost.
Usually one or two entities carry most of the bill; say which, and their share.

## 3. Find what changed

Compare each top entity's daily cost against the baseline. A step up on one day
points at a change that day (a scaling setting, a new pipe, a backfill); a
steady climb points at data growth. Read the service's current scaling and idle
settings with `get_service_details` before explaining a compute cost.

## 4. Recommend with numbers

Only recommend a change you can tie to a line in the data: idle scaling for a
service that runs around the clock with little traffic, a smaller minimum size,
a shorter backup retention, or stopping an unused pipe. Give the cost it
targets, and say what the user should check before applying it (traffic
patterns, recovery needs). Changing a service's settings is the user's call.

## Anti-patterns

- **Quoting list prices.** The cost records are what this organization pays.
- **Saving on the wrong line.** Optimize the entity that carries the bill, not
  the one that is easiest to change.
- **One window, no baseline.** A big number is only a finding when it moved.
