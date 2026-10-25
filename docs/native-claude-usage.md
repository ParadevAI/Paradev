# Passive Claude subscription usage

The host can reuse rate-limit measurements already returned to an explicitly selected Claude account. This is an optional producer for the shared usage tracker, not an additional provider poller.

## Enable

Start the host with `SUPERSET_NATIVE_CLAUDE_USAGE=1`, then select a Claude subscription account through Superset's account picker. The default is off. Turning this on does not edit any provider profile, settings file, login or account default.

For a new terminal launch, Superset adds a per-process `--settings` status-line command. It preserves an existing command's stdin, stdout, stderr, exit status and status-line options. Claude documents that a custom status line hides some built-in footer keyboard hints. Disable the host opt-in to keep the normal footer on subsequent launches.

Existing chats continue running. They receive the terminal hook only on a later natural **new** launch. Attach, resume, continue, fork, print/output-format and managed or ambiguous settings paths keep the original command unchanged. No configuration flag is added to a background attachment: Claude's attach behavior changes when configuration flags are supplied.

The selected `claude-acp` harness also consumes the official adapter's `_claude/rateLimit` usage metadata. It uses the existing immutable account launch context and does not add status-line settings. The older accountless `claude-code` SDK harness remains on the shared HTTP tracker.

## Identity and age

Before a selected process starts, the host captures an opaque generation derived from its current credential, canonical profile and immutable public account identity. The native session and launch are bound separately. Lifecycle hooks require the terminal's existing attribution token and the exact live terminal, workspace, launch, native session and pinned account. A reported path, email or payload account name cannot authorize usage.

The cached provider proof must independently authenticate the same principal and organization under that exact credential generation. Looking up that proof does not issue HTTP requests. With a cold proof cache, native counters and measurements remain quarantined. A later natural status-line frame or ACP event can promote them after the proof warms, preserving their original measurement dates and duplicate markers. It never requires the user to exit a chat just to warm the proof.

The first status-line frame is a baseline. A rise in `cost.total_api_duration_ms` is required before supplied windows become observations. Timer, startup and configuration replays keep the old date. ACP replay and foreign/subagent events cannot advance the response counter. A restored SDK rate-limit event alone is not a new measurement. Each supplied window retains its own `observedAt` and source; a missing window is not fabricated. Lower utilization from a late event in the same reset epoch cannot replace a newer reading.

The native payload does not expose a server observation timestamp. The tracker records when it observes proven API progress, and retains that timestamp through caching, host restart and proof promotion. It does not label an arbitrary idle render as a fresh server response.

## Bounds and fallback

- Claude currently documents the terminal `rate_limits` fields for Pro and Max. Windows can be independently absent. Team accounts and unsupported native versions continue using the common HTTP tracker.
- Only `five_hour` and `seven_day` subscription windows are accepted. Native spend limits, wallet balances, purchased credits, reset credits, plan names and model-specific limits are never inferred.
- Credential rotation, sign-out, registration changes, expired proof or conflicting organizations quarantine the feed. The existing HTTP tracker remains available. A running process cannot be silently rebound to a different credential generation.
- A missing readable credential at prelaunch, or a host crash before the first authenticated native-session capture, cannot acquire authority from a later unbound hook. It falls back to HTTP until a later natural new launch.
- Reconnecting an already-running background worker uses HTTP fallback. Its original hook environment cannot authorize a successor terminal. Late predecessor samples are ignored; previously recorded account measurements retain their original dates only. Pre-feature workers are not claimed to have a native hook.
- The status-line bridge has a 500 ms total local transport deadline, at most four loopback candidates, a bounded response and private bounded duplicate markers. Failed/cold captures retry locally after a short duplicate cooldown. No provider request is made by this path.
- Private observation storage contains only digests, bounded quota windows, counters and dates. It excludes credentials, emails, paths, prompts and transcript text. Observation files are written atomically with owner-only permissions and refuse unsafe symlink destinations.

## Verification

Synthetic regression tests cover replay age, host restart, cold-proof promotion, exact credential/profile/principal binding, rotation, foreign sessions, adoption fallback, partial fields and private storage. Real Node subprocess tests exercise the status-line wrapper, original-command preservation, loopback transport, timeout bounds and skipped attach/configuration paths. ACP fake-transport tests exercise real adapter notification handling, response counters and replay refusal. These tests do not launch a provider or change a real profile.

Live qualification, if requested separately, must use one owned disposable chat with an explicit account, an actual native API response and readback through the common tracker. A synthetic payload is not proof of actual provider emission.

Sources checked against current documentation and the pinned adapter:

- [Claude status-line fields and update lifecycle](https://code.claude.com/docs/en/statusline)
- [Claude sessions and background attachment](https://code.claude.com/docs/en/sessions)
- [Official Claude ACP adapter v0.85.0 rate-limit forwarding](https://github.com/agentclientprotocol/claude-agent-acp/blob/v0.85.0/src/acp-agent.ts)
