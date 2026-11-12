---
name: query-clickhouse
description: Answer a data question from ClickHouse Cloud with a query you can defend — find the right service, database and table, read the schema before writing SQL, filter on the sort and partition keys, and show the query with the answer. Use when the user asks a question about data stored in ClickHouse, how many or how much of something, a trend over time, or wants to explore what tables and columns exist.
argument-hint: the question to answer, and the service or database if you know it
allowed-tools: mcp__clickhouse__get_organizations, mcp__clickhouse__get_services_list, mcp__clickhouse__list_databases, mcp__clickhouse__list_tables, mcp__clickhouse__run_select_query
---

# Read the schema, then ask the smallest question

ClickHouse answers a well-scoped query in milliseconds and a careless one by
scanning billions of rows. The work is finding the table that holds the answer
and writing the query its sort key can serve.

## 1. Find the service

`get_organizations`, then `get_services_list` with the `organizationId`, gives
each service's `id` (the `serviceId` every query tool takes) and its type. Use a
ClickHouse service, not a Managed Postgres one. A service with MCP turned off
refuses queries; say so and point the user to the service's **Connect → MCP**
setting rather than retrying.

## 2. Find the table and read it

`list_databases`, then `list_tables` with `database` (and `like` to narrow the
names) returns tables with their column definitions. Before writing SQL, note:

- The column that holds the time, and its type (`DateTime`, `DateTime64`, a
  `Date` partition column).
- The sort key (`ORDER BY`) and partition key. Filters on their leading columns
  skip data; filters on anything else scan it.
- `Nullable`, `LowCardinality` and `Map` or JSON columns, which change how you
  filter and group.

If several tables look right (raw events, a rollup, a materialized view's
target), prefer the smallest one that can answer the question, and say which
you used.

## 3. Write the query to be cheap and checkable

`run_select_query` runs read-only `SELECT` statements. Always:

- Bound time on the partition or sort key column.
- Add `LIMIT` to exploratory queries; aggregate rather than pulling rows.
- Sample first (`LIMIT 10`) when unsure what a column holds.
- Use ClickHouse functions (`toStartOfHour`, `countIf`, `uniq`, `quantile`)
  rather than porting another SQL dialect.

## 4. Answer with the query

Give the number or the table, the time window, and the exact SQL you ran, so
the user can rerun it. Call out any caveat that changes the number: late-arriving
data, duplicates in a `ReplacingMergeTree` without `FINAL`, or a rollup's
granularity.

## Anti-patterns

- **Unbounded scans.** No time filter on a large table is the most expensive
  mistake available.
- **Guessing column names.** Read `list_tables` first.
- **Trusting one sample row.** A column's first value is not its distribution;
  aggregate.
