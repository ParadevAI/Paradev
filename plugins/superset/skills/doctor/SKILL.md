---
name: doctor
description: Diagnose and fix Superset problems such as connection failures, offline hosts, terminals not attaching, auth or update issues. Use when the user reports something broken or misbehaving in Superset itself ("Superset won't connect", "my host shows offline", "terminal won't attach", "the app is stuck"), before filing feedback.
argument-hint: describe the symptom
allowed-tools: Bash(superset:*)
---

# Superset Doctor

Diagnose first, change one thing at a time, verify after each change.

## 1. Snapshot (read-only, run in parallel, tolerate failures)

- `superset status` for host service health
- `superset auth whoami` for auth and the active org
- `superset hosts list` for host reachability
- `superset --version`

## 2. Match known signatures

| Signature | Fix |
| --- | --- |
| `whoami` fails / session expired | `superset auth login` |
| Host shows offline | `superset hosts wake <id>`; confirm the machine is awake and online |
| Host service not running | `superset start` |
| A host set up with `superset hosts add` is offline or broken | re-run `superset hosts add <ssh-target>`; it checks each step and fixes only what is wrong. On Linux its log is `ssh <ssh-target> journalctl --user -u superset-host -n 50` |
| `hosts add` cannot reach or set up the machine | confirm `ssh <ssh-target>` works from here, the remote is macOS or glibc Linux (x64 or arm64; Alpine and Windows are not supported), and it has `curl` |
| Private repos will not clone on a host added with `hosts add` | sign in GitHub there: `ssh -t <ssh-target> gh auth login` (install `gh` first if missing) |
| Linux host stops when the user logs out of it | enable lingering on that machine: `loginctl enable-linger` |
| `hosts add` stops on an empty or invalid `/etc/machine-id` (cloned VM or container image) | on that machine, `sudo rm -f /etc/machine-id && sudo systemd-machine-id-setup`, then re-run `hosts add`. The user runs this, since it needs sudo on their box |
| `superset pages publish` in a Superset terminal fails with "Not a member of organization" | `superset update`; newer CLIs use the desktop app's account inside its terminals |
| CLI and desktop app version mismatch, or stale CLI | `superset update` |
| App-side misbehavior (macOS) | read the newest entries in `~/Library/Logs/Superset/main.log` for errors |

Propose the matching fix and get the user's go-ahead before running anything that changes state. Never delete data as a "fix".

## 3. Verify

Re-run the originally failing action. If it works, say exactly what was wrong and what fixed it.

## 4. Escalate with evidence

If unresolved, offer to file it with the feedback skill and carry over the collected diagnostics (versions, status output, the relevant log excerpt) so the report arrives pre-triaged. Ask before including any log content; logs can contain paths and project names.
