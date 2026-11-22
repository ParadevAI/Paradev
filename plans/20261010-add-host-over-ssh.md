# Add a host over SSH

Status: phase 1 shipped in #8386 (API) and #8388 (CLI); phase 2 is the desktop dialog. Decisions are recorded under "Decisions".

## Goal

`superset hosts add user@box` turns any machine you can SSH into into a Superset host, in one
command and with nothing typed on the other machine. Today that takes three manual steps on the
remote (install the CLI, sign in, `superset start --daemon`), and the host does not survive a
reboot.

This copies herdr's `machine add` (the setup half) and fits the north star in the August
remote-onboarding plan (`git show abe5849edc^:apps/desktop/plans/20260817-remote-onboarding-improvements.md`):
the trusted machine starts setup, and the new machine never types an account credential. SSH
access is proof enough of ownership of the box, so the paste disappears too.

## What we copy from herdr, and what we don't

herdr runs all its traffic over SSH. Superset already has a transport: the relay. So SSH is only
the setup channel here. After setup, the host connects to the relay like every other host and
the desktop finds it there, with no SSH session kept open.

| herdr `machine add` | Superset `hosts add` |
|---|---|
| Uses the user's own ssh and `~/.ssh/config`; no credentials stored | Same |
| Detects OS/arch with `uname`; clear error for unsupported | Same. Supported: macOS x64/arm64, glibc Linux x64/arm64. musl/Alpine and Windows: error with the reason |
| Finds an existing install (PATH, Homebrew, fixed paths) | `~/superset/bin/superset`, then `command -v`, then Homebrew paths |
| Installs after consent, `[Y/n]` | Same prompt; `--yes` for scripts |
| Pushes the binary over ssh stdin | The remote runs the existing installer pinned to our version (`SUPERSET_VERSION=… install.sh`). Pushing the local tarball is a later fallback for hosts with no internet |
| Server is a `setsid` daemon, restarted on next attach | We need the host up before anyone attaches, so it runs as a user service  |
| Strict host keys and BatchMode in the background; live stderr while interactive, so MFA and Tailscale URLs show | Same: setup is interactive and relays ssh stderr live |
| Reconnect, `machine status` | `superset hosts status` already exists via the relay; no SSH reconnect needed after setup |

## Flow

`superset hosts add <ssh-target> [--org <org>] [--name <name>] [--yes]`

1. **Reach the box.** One ssh ControlMaster for the whole run, so MFA is asked once. Relay ssh
   stderr live. On failure, use herdr's hints: "verify access with `ssh <target>`", "load your key
   with `ssh-add`", host-key mismatch.
2. **Detect the platform.** `uname -s; uname -m`; detect musl (`ldd --version`) and refuse it with
   the reason.
3. **Check the machine id.** Read `/etc/machine-id` (Linux). An empty or known-duplicate id
   (cloned VM images, e.g. the empty-id hash `a5b47ded…`) would collide with other hosts in the
   org. Stop with the fix (`sudo systemd-machine-id-setup`) rather than doing it silently.
4. **Install or update.** Find an existing `superset`. If it is missing or not this CLI's
   version (desktop, CLI and host-service ship in lockstep), ask, then run the installer pinned to
   our version. Always call it by absolute path afterwards, since a non-interactive ssh shell does
   not read the rc file the installer edits.
5. **Sign the host in** . Mint the host's credential on this machine and send it over
   ssh **stdin**, never in argv, so it stays out of `ps`, shell history and logs. Needs
   `superset auth login --api-key=-` to read the key from stdin.
6. **Start it and keep it running** . `superset start --org <id>` under a user service:
   a systemd user unit on Linux (`KillMode=process`, no `--daemon`; this is the unit
   `apps/docs/content/docs/cli/host-server.mdx` already documents), and a LaunchAgent on macOS.
   Without the service, `--daemon` and a warning that it won't survive a reboot.
7. **Wait for it.** Poll `host.list` until the new machine id is online (registration retries for
   up to 5 minutes, so the exit code of `start` is not enough). Print the host and a link to it.
8. **Re-run is repair.** Running `hosts add` again on the same target checks each step and fixes
   only what is wrong (outdated version, stopped service, revoked credential).

Also: `superset hosts remove <host>` stops the service, uninstalls it, and revokes the credential.

### Known gaps it reports, not fixes

- **GitHub on the remote.** Cloning private repos needs `gh auth login` there (no brokered GitHub
  token yet, see north star 2). Detect `gh auth status` at the end and print the one command to
  run, with `superset terminals attach --ssh` as the way to do it from here.
- **Agent sign-in.** Claude/Codex logins on the remote are per machine; detect and print, as
  with `gh`.

## Desktop

Settings → Hosts → "Add host" gets a second option next to the PR #6584 guide: **Set up over
SSH**. It asks for the SSH target and runs `superset hosts add <target>` in a terminal
embedded in the dialog (the `CommandTerminal` the GitHub sign-in dialog uses). The command
sets `SUPERSET_ORGANIZATION_ID`, so the bundled CLI acts as the app's account through the
local host (`host.apiToken`), as in a workspace terminal. Without a local host it runs
`superset auth login` first. Running in a real terminal is deliberate: MFA prompts, host-key
questions, Tailscale login links and the install consent all work as in a terminal, with no new
UI for any of them. The existing live "host appeared" flip on that page then opens the new
host.

## Phases

1. **CLI `hosts add` / `hosts remove`** with the flow above, plus `auth login --api-key -`.
   Verified against a real Linux box (fresh VM) and a second Mac, both directions of re-run.
2. **Desktop entry point** (terminal-backed), on top of #6584's Hosts page if it lands, else on
   main's Hosts page.
3. **Scoped host credential** if phase 1 ships with an account API key: an org-scoped,
   host-bound credential the host can't use for anything else, revoked with the host.
4. **Offline install fallback**: push the local tarball over ssh stdin when the remote can't
   reach GitHub (herdr's approach).

## Decisions (made 2026-10-10)

Chosen: 1a, 2a, 3a.

1. **Host credential.** (a) Ship with an account API key named for the host, sent over stdin,
   revocable under API keys and by `hosts remove`; scoped credential in phase 3. (b) Build the
   scoped host credential first (new table, mint and redeem endpoints, host auth path), then ship.
2. **Reboot survival.** (a) Install the user service by default, `--no-service` to skip. On Linux
   a user unit only runs while the user is logged in unless lingering is enabled
   (`loginctl enable-linger`, which may need sudo); ask once. (b) Opt-in `--service`. (c) None,
   like herdr.
3. **Desktop shape.** (a) Terminal-backed, as above. (b) A native form with its own prompts for
   consent, MFA and errors.

## Testing

- Unit: target parsing, platform/musl detection, machine-id checks, service file generation,
  version comparison. One test per behaviour, no real ssh.
- Live: a throwaway Linux VM and a second macOS machine, using a key-only test `sshd` locally for
  the error paths (as in the `terminals attach --ssh` verification). Fresh install, re-run as
  repair, reboot survival, revoked credential, wrong-arch, musl refusal.
