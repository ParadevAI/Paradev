# Community plugin directory from a GitHub topic

Status: proposal (2026-10-13). Not started.

## Why

herdr.dev/plugins lists 1,696 community plugins. It builds the list automatically from GitHub
repositories tagged with the topic `herdr-plugin`, refreshed every 30 minutes
(`~/workplace/herdr/docs/next/website/src/content/docs/marketplace.mdx`). Every listing is a
backlink to herdr and a reason for the community to build on it, and it costs herdr no review time.

Superset's plugin system already supports third-party marketplaces: a plugin is a `plugin.json`
plus `skills/`, a release is a git tag `<name>@<version>`, and `superset plugins install` fetches
that tag (`docs/plugins.md`). What is missing is discovery: today only first-party plugins in
`.agent-marketplace.json` are listed, and superset.sh has `/marketplace/themes` but no plugin page.

## Goal

A public, searchable page at `superset.sh/marketplace/plugins` that lists community plugins found
through the GitHub topic `superset-plugin`, with an install command per plugin, and a docs page that
tells plugin authors how to get listed.

## Scope

1. **Crawler** (scheduled job, e.g. a Vercel cron in `apps/api` or a GitHub Action writing to the DB):
   - Search GitHub for repositories with topic `superset-plugin`, every 30–60 minutes.
   - For each repo, read `plugin.json` (or a root `.agent-marketplace.json`) at the default branch,
     and the latest `<name>@<version>` tag.
   - Validate against the existing manifest schema; skip invalid repos and record why.
   - Store name, description, author, category, icon, stars, latest tag, repo URL, last seen.
2. **Directory page** in `apps/marketing` next to `/marketplace/themes`: search, category filter,
   sort by stars or recent, and a card per plugin with install steps. Today `plugins install` reads
   `name@marketplace`, not a repo and tag, and installs only from registered marketplaces, so the
   card must either add the plugin's repo as a marketplace first or the CLI needs a direct install.
   Each plugin gets an indexable detail page (SEO).
3. **Docs**: "Publish a plugin to the community directory" in `apps/docs`, covering the topic, the
   manifest, tags as releases, and what the listing shows.
4. **In-app** (later): a "Community" tab in the desktop plugin browser that reads the same index.

## Security

Community plugins ship skills and, optionally, a vendor MCP server URL. They are not reviewed by us.

- Label every community listing as unreviewed, and show the repo and author before install.
- Never resolve credentials or `token_url` from a community manifest; the API resolves those only
  for first-party manifests (`manifests.generated.ts`), and that rule must not change.
- Pin each listing to the commit SHA its tag resolved to when indexed, and install that SHA (or
  refuse if the tag now resolves elsewhere). Tags can be moved, so a tag alone does not stop a
  listing from changing under a user.
- Add a report link and a server-side denylist.

## Open questions

- Do we accept plugins that declare an MCP server, or only skills, in v1?
- Where does the index live: the API database or a generated JSON in the marketing build?
- Rate limits for GitHub search with many repos: use a GitHub App token.

## Success measure

Listed community plugins and installs per week; backlinks from plugin READMEs to superset.sh.
