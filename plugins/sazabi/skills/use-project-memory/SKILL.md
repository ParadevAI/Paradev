---
name: use-project-memory
description: Read Sazabi project memory (how the system is laid out, what healthy looks like, runbooks, past incidents) before investigating or changing production behavior, and write back durable findings once they are verified. Use at the start of an investigation or on-call task, when the user mentions a runbook or a past incident, or after resolving something worth remembering.
argument-hint: the system, symptom, or finding to look up or record
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# Start from what the team already knows

Project memory is curated knowledge the Sazabi agent and your teammates rely
on: architecture notes, what normal looks like, runbooks for recurring
problems, and write-ups of past incidents. Reading it first saves rediscovering
known causes. Writing to it keeps the next person from starting over.

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).
Memory operations: `sazabi/memory.search`, `sazabi/memory.list`, `sazabi/memory.create`, `sazabi/memory.update`.

## 1. Read first

Before investigating, run `sazabi/memory.search` for the service, the symptom
and the error. Open matching runbooks and incident notes. Follow a runbook's
steps when it fits, but check it against the current code and logs: memory can
be stale, and a runbook for last year's architecture is a lead, not an order.

## 2. Write only what lasts

After the work is verified, decide if anything is durable:

- **Worth writing:** a root cause that could recur, a runbook for a procedure
  you just did by hand, a fact about the system that took effort to find.
- **Not worth writing:** raw logs, guesses, one-off findings, anything that
  will be wrong next week, secrets.

Use clear paths: `runbooks/<topic>.md` with kind `runbook`, or
`notes/investigations/<topic>.md` with kind `note`.

## 3. Create or update, never clobber

Search for an existing document on the topic first. If one exists, update it
with `sazabi/memory.update` and keep what is still true. `memory.create` fails
when the path is taken, and `memory.update` fails when it is empty, so a
failure means you picked the wrong one, not that you should force it.

Show the user the document before you write it to a shared project.

## Anti-patterns

- **Treating memory as truth.** Verify against code and logs before acting.
- **Writing a transcript.** Memory should be a few paragraphs a teammate
  can act on.
- **Duplicates.** Two runbooks for one problem drift apart; update the one
  that exists.
