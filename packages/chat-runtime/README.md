# @superset/chat-runtime

`HarnessAdapter` → `LiveSession` → journal (`chat.db`) → `SubscriptionHub` → sinks; commands drive it.

A harness adapter emits protocol events, `LiveSession` turns them into durable events, the journal assigns each one a cursor and persists it in the package's own SQLite file (writing the read-model projection in the same transaction), and the hub fans the resulting envelopes out to subscribers — replaying from the journal first so a reconnecting client sees no gap. Everything a client can do (create a session, prompt, cancel, answer an approval, page history) enters through `commands/`.

The runtime speaks only the vocabulary in `plans/chat-protocol-v1.md`; it never resolves workspaces, spawns processes, or touches host.db. Callers pass a resolved `cwd`.

## Reading order

| Folder | What lives there |
|---|---|
| `db/` | `schema/` (the `chat_journal` + `chat_sessions_local` tables), `createChatDb/` (better-sqlite3, WAL, migrations applied at open) and `drizzle/` (the generated migrations this package owns) |
| `journal/` | `journal/` appends a durable event and the projection row in one transaction; `epoch/` mints an epoch on create or journal loss (journal is its only consumer, so it nests here) |
| `replay/` | Reads the spine: `readSince`, `readPage`, `latestSeq`. Top-level because journal, stream, commands and the test helpers all consume it |
| `projection/` | Every `chat_sessions_local` read and write, plus `ChatSessionStore`. Top-level because journal, replay, commands and the root wiring all consume it |
| `harness/` | `HarnessAdapter` + `AdapterEvent` — the contract every harness implements — and `fake/`, the scripted adapter that drives the tests. Adapters emit protocol shapes only: no cursors, no persistence, no sockets |
| `sessions/` | `liveSession/` (one running session: event pump, FIFO prompt queue, cancel) and `registry/`, which builds one per harness |
| `stream/` | `subscriptions/` — `SubscriptionHub`: replay-then-live subscribe, per-subscriber delta channels, reset frames, delta coalescing |
| `commands/` | The client-facing verbs, each parsed with the `@superset/chat` command schemas and deduped by `commandId` |
| `testing/` | The cross-cutting test helpers no single module owns — `fixtures/` (protocol item factories), `testUtils/` (sinks, schedules, waits) and `testRuntime/` (the bun-sqlite runtime). Internal only: relative imports, no package export. Helpers that do have an owner stay beside it, like `harness/fake/` |

## Wiring a harness

```ts
const runtime = createChatRuntime({
  dataDir,
  harnesses: new Map([
    ["claude-code", (opts) => createClaudeAdapter(opts)],
    ["codex", (opts) => createCodexAdapter(opts)],
  ]),
});
```

Both adapters land in M3/M4 of `plans/chat-ship-plan.md`. Today the registry is empty by default and only tests register the fake, via `fakeHarnessRegistry()` from `src/testing/testUtils`.

When host-service mounts this package it must pass `migrationsFolder`: the generated `src/db/drizzle/` directory is a runtime file dependency that the bundler will not inline.
