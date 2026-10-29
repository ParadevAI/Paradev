# Plugins

A plugin is a bundle of skills and MCP tools an agent can use, installed per user account and
materialized onto every machine that account signs into. First-party ones live in `plugins/<name>/`
and are listed in `.agent-marketplace.json` at the repo root.

## What is source and what is generated

Only two things in a plugin directory are hand-written:

| Path | Owner |
| --- | --- |
| `plugins/<name>/plugin.json` | you |
| `plugins/<name>/skills/*/SKILL.md` | you |
| `.agent-marketplace.json` | `superset plugins create` / `publish` |
| `packages/shared/src/plugins/manifests.generated.ts` | `superset plugins publish` |

A plugin ships no code. Tools come either from the vendor's own MCP server, which Paradev proxies
to, or from a server Paradev hosts itself for the handful of plugins whose vendor publishes none
(`SUPERSET_HOSTED_PLUGINS` in `packages/shared/src/plugins/index.ts`, implemented under
`packages/trpc/src/router/plugins/servers/`). Hosted tools ship on an API deploy, not a plugin tag.

`manifests.generated.ts` is generated; editing it by hand is the one way to get a marketplace that
disagrees with itself. It exists because the API must resolve `token_url` and the proxy target
*without* trusting anything client-supplied; a manifest posted in a request would be an
exfiltration path.

**A release is a git tag, not a folder.** `<name>@<version>` on the marketplace repo is the version:
`plugins install` fetches that tag and takes the plugin's skills at it, so what a host installs
belongs to the version rather than to whatever the branch holds now. A `path:` marketplace has no releases in it
and installs the working tree, which is what makes local authoring work.

## Changing a plugin

```bash
superset plugins publish <name> --bump patch   # rewrites the marketplace entry and the bundle
git add .agent-marketplace.json plugins/<name> packages/shared/src/plugins/manifests.generated.ts
git commit -m "publish <name>@<version>"
bun run check:plugins                          # what CI runs; catches a change that skipped publish
```

Merge to main and `.github/workflows/tag-plugin-releases.yml` pushes `<name>@<version>` at the
merge commit. Don't tag by hand on a branch: a squash merge leaves that tag off main.

`superset plugins validate` takes a path (`plugins/<name>`), not a name. To test a plugin locally,
`superset plugins marketplace add <path>` then `superset plugins install <name>`. Install copies the
plugin into a cache, so after an edit run `superset plugins install <name> --update`; `plugins sync`
reads the cached copy and does not see the working tree.

A third-party marketplace needs `.agent-marketplace.json` at its root (`$schema`, `name`,
`description`, `owner`, `plugins: []`); `plugins create` refuses to run without it. Its plugins get
skills only: `desiredPluginMcpServers` emits MCP entries for `PLUGIN_CATALOG` plugins alone, and
`connector.slug` must already exist in `connectors.json`.

`check:plugins` fails on a marketplace entry whose version disagrees with `plugin.json`, a `server/`
build that is stale against `src/`, a `manifests.generated.ts` that a publish would rewrite, and a
tag whose tree no longer matches the working tree — which is how an edit that skipped publish gets
caught. An unreleased version has no tag yet and is not an error.

Bump the version rather than moving a tag: a tag someone's account is pinned to is the one thing
that must not change under them.

## Manifest shape

`plugin.json` follows the Codex plugin vocabulary — `name`, `version`, `description`, `author`,
`license` — with everything Paradev-specific under `extensions.superset`:

- `interface` — `displayName`, `category` (one of `PLUGIN_CATEGORIES` in
  `packages/shared/src/plugins/index.ts`), and `icon`.
- `connector` — the one connection this plugin needs, as `{ "slug" }`. A slug names a connector in
  `packages/shared/src/connectors/connectors.json`; the manifest carries no OAuth configuration of
  its own — no scopes, no client mode, no `requires_env`. A connection is account state, and the
  connections system already owns obtaining, refreshing and disconnecting it, so naming one is all
  a plugin does. Omit it for a plugin whose tools need no connection.
- `bind` — how the connection's credential is attached to outbound calls.
  `${config.access_token}` and `${inputs.<name>}` placeholders are resolved server-side by
  `packages/trpc/src/router/plugins/manifest.ts`.
- `mcp` — the vendor's own MCP server (`type: "streamable-http"`, `url`, optional `headers`), not a
  map: a plugin serves tools from exactly one place. Omit it for a Paradev-hosted plugin.

The published JSON Schema at `https://superset.sh/schemas/plugin/1.0.0.json` is generated from
`pluginManifestSchema` in `packages/shared/src/plugins/manifest-schema.ts`, and
`superset plugins publish` validates against that same definition — so the schema we serve and the
schema we enforce cannot drift.

### Where a connection comes from

How a connector obtains its connection is the connections system's decision, not a manifest field.
A connector either names a pre-registered client through `requires_env` in `connectors.json`, or
declares `"client": "dynamic"` and takes both endpoints and client identity from the MCP server at
connect time: the API reads `/.well-known/oauth-protected-resource`, follows it to the
authorization server's metadata, and then gets a client identity one of two ways:

- the server advertises `client_id_metadata_document_supported`, so the client id is the URL of a
  document we host at `/api/connectors/<connector>/client-metadata` — nothing is registered or
  stored; or
- the server offers a `registration_endpoint`, so we register once per authorization server
  (RFC 7591) and keep the result in `plugin_oauth_clients`, keyed by issuer and redirect URI so
  every user shares one registration.

Either way the flow is PKCE with a `resource` indicator, the authorization response's `iss` is
checked against the discovered issuer before the code is redeemed (RFC 9207), and refresh happens
before a tool call. This is what lets a hosted MCP server be installable without anyone registering an
OAuth app first.

Credentials never reach the manifest, the renderer, or the agent's machine. They are sealed at rest
by `packages/trpc/src/lib/secret-box.ts` under `SECRETS_ENCRYPTION_KEY` and attached by the proxy in
`packages/trpc/src/router/plugins/proxy/`, so a tool call goes out from the API, not from the
agent.

## Install state on a machine

One file, `$SUPERSET_HOME_DIR/plugins/installed_plugins.json`, records what is materialized. Note
`SUPERSET_HOME_DIR` — `SUPERSET_HOME` is the CLI installer's prefix (see
`apps/marketing/public/cli/install.sh`) and names nothing here.

Every provisioner reads that file: the desktop at boot, `superset plugins sync`, the host-service.
That is deliberate. Provisioning is *declarative* — `createManagedSkills` in `@superset/agent-setup`
writes the desired set and reaps whatever is absent, so a caller that hands in its own plugin list
instead of letting agent-setup read the file has just told it every other caller's plugins are gone.
The desktop's next boot would undo a `plugins sync`, and vice versa.

Skills land in `~/.agents/skills` (what Codex, Cursor, OpenCode, Gemini CLI, Vibe, and Kimi read
natively) and are mirrored into `~/.claude/skills` as a plugin directory, because Claude does not
read the shared convention.

Plugin MCP servers are also synced to Claude's `~/.claude.json`, Codex's
`~/.codex/config.toml`, and pdev's `~/.paradev/agent/mcp.json`. pdev honors
`PDEV_CODING_AGENT_DIR` when set. Claude and pdev entries share the ownership ledger at
`$SUPERSET_HOME_DIR/plugins/mcp-ledger.json`: user-defined or user-edited servers are
left alone, while disabling or uninstalling a plugin removes unchanged managed entries.
Paradev proxy entries use `headersHelper` to read current auth at connection time rather
than store a token. pdev needs a build with `headersHelper` support; older builds ignore it.

## Organization plugins

An organization gets its own plugins from a GitHub repository. An owner or admin adds the
repository as a source (repository, ref, path). Sync reads `.agent-marketplace.json` at that path,
the same format as this repository's marketplace: each plugin's `source` is a `./` directory in the
repository. Like Codex, it packs the whole plugin directory into a bundle, so skills can use
`scripts/`, `assets/` and other folders next to them, and executable files stay executable. It
leaves out `.git`, `node_modules` and `hooks/`, which Superset does not run. A plugin may have at
most 500 files and must pack to 2 MB gzipped (16 MB unpacked); sync checks the file count, the
unpacked size and the size of already-compressed files such as images before it downloads any.
Bundles go to the
private R2 bucket; each plugin is a row in `organization_plugins` under a marketplace named
`organization-<organization id>`. Two organizations' same-named plugins never share an install.

Sync runs when an admin adds a source and when they click "Sync now" (or run
`superset plugins organization sources sync`); there is no schedule. Like Codex, it reads the
repository only with the GitHub account of the admin who added the source, while that admin is still
an admin with GitHub connected; Settings shows it as "Syncs as @login". To take a source over,
another admin adds the same repository again. A plugin whose files did not change, by the blob
hashes in the tree listing, is not downloaded again. A plugin that fails to sync keeps its last good
version, and its problem is listed on the source. A plugin that leaves the repository is marked "No
longer in source": members who have it keep it, but it is not offered or installed anew. Changed
content that reuses a declared version is refused. Removing a source removes its plugins from the
organization and from every member.

Each plugin has an access policy per role (owner, admin, member): `unavailable`, `available` or
`installed`. A new plugin is available to owners and admins only. `installed` gives every member of
the role an install that they can disable but not remove; setting it back to `available` keeps those
installs, and `unavailable` removes them. A policy change only touches the roles it names. Every read
path checks the policy in the plugin's own organization: the catalog, install, bundle download, the
tool proxy and the cloud workspace plugin list. A machine keeps the plugins of every organization the
member belongs to, and the proxy serves them whichever organization is active. `plugins.list`
returns organization plugins only to clients that pass `includeOrganization`, because released
clients cannot install them.

A plugin may have only skills. A plugin with tools must name a connector that has a tool server of
its own, or give an `https` `mcp.url` that is not a private or internal address. It cannot take a
first-party plugin's name, because a client keys each tool server by plugin name.

## Command surface

```
superset plugins create|build|validate|publish  # authoring
superset plugins install|uninstall|list|sync    # this machine
superset plugins enable|disable <name>          # without dropping its skills
superset plugins connect|connections            # credentials
superset plugins marketplace list|add|remove    # marketplace sources
superset plugins organization list|access       # an organization's own plugins
superset plugins organization sources add|list|remove|sync  # their GitHub sources
superset mcp tools|call-tool                    # call a plugin's tools through the proxy
superset skills list
```
