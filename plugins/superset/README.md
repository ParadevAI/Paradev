# Paradev plugin

Paradev (formerly Superset) runs coding agents in parallel, each in its own workspace. This
plugin lets Claude drive Paradev for you: create workspaces, start and monitor agents, manage
tasks, schedule automations, publish pages, and lay out panes in the desktop app.

## Sign in

The skills need the `paradev` CLI on your `PATH`. `superset` is an alias for the same binary.
If `paradev` is not found, run the same command as `superset`, or update the CLI.

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
paradev auth login      # opens your browser to sign in
paradev auth whoami     # confirms the account and organization
```

For CI or a headless machine, pass an API key with `--api-key` or set `PARADEV_API_KEY`. Create
the key in the Paradev web app.

## How the skills work

Every skill and the `superset-automation` command runs the local `paradev` CLI through Bash. None
of them call the Paradev MCP server directly. That server is a separate way to connect an MCP
client to the same account; see [paradev.com/mcp-install](https://paradev.com/mcp-install).

- **Account and workspace skills** (`orchestrate`, `standup`, `automate`, `10x`, `setup`,
  `environment`, `panes`, `page`, `doctor`): the CLI reads and changes workspaces, agents,
  terminals, tasks, automations, environments, pages, and desktop panes.
- **`plugins` and `integrations`**: `paradev mcp` sends tool calls to the Paradev API, which
  attaches the stored credential and forwards the call to that integration's MCP server.
- **`browser`** drives the browser pane in a Paradev workspace. It uses Browser Use only when a
  pane cannot reach the page, and asks before it installs anything.
- **`computer`** drives desktop apps through Cua Driver or Peekaboo, and asks which to install
  if neither is present.
- **`feedback`** and **`contribute`** use `paradev feedback` or the GitHub CLI (`gh`).

## Data handling

- The CLI sends requests to the Paradev API as your signed-in account.
- Integration credentials stay on the Paradev server. No integration token is written to your
  machine.
- `page` uploads the HTML you choose and makes it visible to your organization.
- `feedback` sends a report privately to the Paradev team, or opens a public GitHub issue. It
  asks before it includes repository contents, terminal output, or logs.
- `standup` and the `10x` audit only read your account. They change nothing unless you ask.
