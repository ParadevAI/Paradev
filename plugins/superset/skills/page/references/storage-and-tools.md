# Page storage scopes, agent writes and live data

Read this when a page needs private or shared values, when an agent should
write a page's storage, or when a page needs live data from a plugin.

## Storage scopes

Each call takes an optional `{ scope }` as its last argument:

```js
await store.set("vote", "Ramen");                          // slot: mine, everyone reads all
await store.set("draft", text, { scope: "private" });      // only I can read it
await store.set("status", "closed", { scope: "shared" });  // one value, last writer wins
const status = await store.get("status", { scope: "shared" });
store.subscribe("status", (records) => render(records), { scope: "shared" });
```

- **slot** (default): one value per person. Votes, RSVPs, claims.
- **private**: one value per person, readable only by them. Drafts, settings.
- **shared**: one value per key; any member of the page's organization can
  overwrite it, and `getAll` returns a list of one naming the last writer.

A shared key counts against the 500-key limit of the person who created it.

### List keys

`list(prefix, { scope })` returns the keys in one scope that start with
`prefix`, sorted by key, at most 1000. Leave out the prefix to list every key:

```js
const keys = await store.list("pipeline:", { scope: "shared" });
// [{ key: "pipeline:1", records: 1, updatedAt: "2026-10-12T09:30:00.000Z" }, ...]
```

`records` is how many values you can read under the key: one per person for
slot, one for shared and private. In private scope you see only your own keys.

## Write storage from an agent

An agent can write a page's storage as the signed-in user, so an automation can
refresh page data without a republish (MCP: `pages_storage_set`,
`pages_storage_remove`):

```bash
superset pages storage <page> --key data --scope shared --set '{"deals": 42}'
superset pages storage <page> --key data --scope shared --remove
```

## Live data: `window.superset.tools`

A page can call a plugin's tool as the person viewing it, through their own
connected account. Superset makes the call; the page makes no network request.

```js
const tools = window.superset?.tools;
if (await tools?.ready) {
  const result = await tools.call("neon-readonly", "run_sql", {
    sql: "select count(*) from organizations",
  });
}
```

- `result` is the tool's MCP result: `{ content, structuredContent? }`.
- The viewer allows each plugin once per page, and may install or connect it.
  A grant covers every tool, writes too, and later page versions, and the page
  can send what it reads to other websites.
- Use `neon-readonly` for dashboards. Read-only is not enforced yet for accounts
  connected with write access, so do not rely on it for safety. `exa` is search.
- Handle absence and errors by `error.code`: `needs_install`, `needs_connection`,
  `denied`, `unavailable_signed_out`, `rate_limited`, `invalid`, `tool_error`,
  `unavailable`. A tool that fails returns `tool_error` with the tool's message.
- Each viewer sees their own data. Desktop and web only, not mobile. A call
  takes seconds (60 s timeout, not counting the dialog): show a loading state,
  and cache a snapshot in `window.superset.storage` with `{ scope: "shared" }`
  when everyone should see the same data.
