---
name: send-agent-telemetry
description: Stream coding-agent session telemetry (prompts, tool calls, model requests, tokens and cost) from Claude Code or Codex into Sazabi over OpenTelemetry, with privacy settings chosen on purpose. Use when the user wants observability for their coding agents or agent fleet, to track agent token usage or cost, to audit what agents ran, or to send agent telemetry to Sazabi.
argument-hint: which agents (Claude Code, Codex) and whether prompt text may be exported
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# See what your agents did

Claude Code and Codex have built-in OpenTelemetry exporters. Pointed at Sazabi,
every session becomes searchable: prompts, tool calls and results, model
requests with token counts and cost. Then "what did the agents run last night"
and "which sessions cost the most" are questions for `sazabi/logs.ask`.

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).

## 1. Decide what may leave the machine

Ask before exporting prompt text. Prompts and tool inputs can contain code,
customer data and credentials. Codex always exports tool-call arguments and
truncated results, whatever the prompt setting, so say that plainly when the
user picks Codex. Default to prompts off unless the user opts in.

## 2. Get an intake URL per agent

Run `sazabi/logSources.list`. If there is no source for this agent yet, create
one with `sazabi/logSources.create` in manual mode (one source per agent:
Claude Code, Codex) and use the intake endpoint it returns. Keep the URL out of
any committed file.

## 3. Configure the agent

**Claude Code** reads the `env` block of `~/.claude/settings.json` (or a
project's `.claude/settings.local.json`, which must stay untracked):

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "<intake URL>",
    "OTEL_LOG_USER_PROMPTS": "0",
    "OTEL_LOG_ASSISTANT_RESPONSES": "0"
  }
}
```

Set `OTEL_LOG_ASSISTANT_RESPONSES` explicitly: unset, it follows the prompts
setting. Do not set a metrics exporter; Sazabi does not store Claude Code
metrics.

**Codex** reads `~/.codex/config.toml`. Use one `[otel]` table with an inline
`exporter`, and the full logs URL including `/v1/logs` (Codex does not add it):

```toml
[otel]
log_user_prompt = false
exporter = { otlp-http = { endpoint = "<intake URL>/v1/logs", protocol = "binary" } }
```

If `[otel]` already exists, edit it in place. A second `[otel]` header is a
TOML error that stops Codex from starting.

Merge into existing files; never overwrite a user's settings.

## 4. Prove it

Agents load settings at startup, so start a new session and run one prompt.
Then ask `sazabi/logs.ask` for `claude_code.api_request` or `codex.api_request`
events in the last 15 minutes. Report what is flowing, what is excluded, and a
first useful question, such as cost per session today.

## Anti-patterns

- **Turning on prompt export without asking.** It is the user's data, and
  sometimes their customers'.
- **Committing the settings file.** It holds the intake URL.
- **Assuming it works.** A session that started before the change exports
  nothing new.
