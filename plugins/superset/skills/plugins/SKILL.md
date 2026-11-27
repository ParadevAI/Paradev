---
name: plugins
description: Install Paradev (formerly Superset) plugins, connect the accounts they need, and call their MCP tools through the credential proxy. Use when the user wants a plugin installed, removed, enabled, or connected, asks what tools a plugin exposes, wants to call one, adds a marketplace, or asks why a plugin's tools are not available.
argument-hint: what you want to install, connect, or call
allowed-tools: Bash(superset plugins:*) Bash(paradev plugins:*) Bash(superset mcp:*) Bash(paradev mcp:*) Bash(superset skills:*) Bash(paradev skills:*)
---

# Plugins and their tools

If `paradev` is not found, run the same command as `superset`, or update the CLI.

A plugin brings two things: **skills**, which land in the directories agents read, and **MCP
tools**, which are called through Paradev's proxy. Install state lives on the account, so a
plugin installed here is installed everywhere you sign in. The credential does not. It stays
server-side, and no token is ever written to this machine.

## 1. See what is there

```bash
paradev plugins list                  # installed, with status per plugin
paradev plugins list --available      # everything the marketplace offers
paradev skills list                   # skills on this machine, and their paths
```

The `status` column is the thing to read. `needs connection` means the skills are installed
but no account is authorized, so the tools will fail. That is a connect step, not a bug.

## 2. Install

```bash
paradev plugins install linear
paradev plugins install linear --update      # move to the marketplace's current version
paradev plugins install linear@superset      # when two marketplaces carry the same name
```

Install records the plugin on the account and materializes its skills locally. It prints
whether a connection is still needed.

## 3. Connect an account

Two shapes, and the plugin's manifest decides which:

```bash
paradev plugins connect linear                       # oauth2: prints a URL to open
paradev plugins connect sentry --inputs '{"api_key":"..."}'
echo '{"api_key":"..."}' | paradev plugins connect sentry --inputs -
```

Prefer stdin for a real credential: an argument is visible in `ps` and in shell history.
OAuth cannot finish headlessly: hand the URL to the user, then confirm with
`paradev plugins list`.

If a plugin offers more than one method, the command says so and lists them. Ask the user
which they want rather than picking.

## 4. Call its tools

Address a plugin by name, from the `PLUGIN` column of `paradev plugins list`. A connection id
is not accepted: credentials live on the connector a plugin names, and one connector can back
several plugins, so an id no longer says which plugin was meant.

Arguments are the last positional, not an option, and `-` reads them from stdin.

```bash
paradev mcp tools --plugin linear
paradev mcp call-tool list_issues --plugin linear
paradev mcp call-tool create_issue --plugin linear '{"team":"ENG","title":"Export 500s"}'
echo '{"team":"ENG","title":"..."}' | paradev mcp call-tool create_issue --plugin linear -
```

List the tools before calling one. Names and argument schemas come from the plugin's server,
not from anything in this repo, and they change between versions. The `integrations` skill
covers this end in full: reading a tool's arguments, choosing an account, parsing the
result.

The call goes out from Paradev's API, which attaches the credential. That is why this
works with no token on the machine, and why a network-restricted sandbox can still reach a
plugin's tools.

### Reading a failure

| What you see | What it means |
| --- | --- |
| `needs connection` in `plugins list` | Installed, not authorized. Run `plugins connect`. |
| 401/403 from a tool call | The stored credential was revoked or expired. Reconnect. |
| `is not installed` | Installed on the account but not resolvable here; run `plugins install --update`. |
| More than one marketplace named | Two installs share the name. Re-run with `name@marketplace`. |

## 5. Turn things off

```bash
paradev plugins uninstall linear     # uninstall, and reap the skills it provisioned
paradev plugins disable linear       # keep the install, stop provisioning its skills
paradev plugins marketplace list
paradev plugins marketplace add owner/repo      # add a third-party marketplace
paradev plugins marketplace remove <name>
```

`uninstall` reaps only what the plugin provisioned; hand-written skills in the same directory
are left alone. It removes the plugin locally even when the account call fails, and says so.
Read that message: the stored credential is revoked as part of the account removal, so an
unconfirmed removal means the skills are gone from this machine while the connection lives
on. Check with `paradev plugins list` and run `uninstall` again.

## Anti-patterns

- Calling a tool without listing tools first. You are guessing at a name and a schema that
  the plugin owns.
- Passing a secret as a command argument when the command accepts stdin.
- Treating `paradev plugins sync` as a fix for a missing connection. Sync converges skills
  on this machine; it has nothing to do with credentials.
- Installing a plugin to "see what it does". Install writes to the user's account and every
  machine they use. Ask first.
