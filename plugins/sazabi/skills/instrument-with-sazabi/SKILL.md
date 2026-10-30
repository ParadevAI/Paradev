---
name: instrument-with-sazabi
description: Get an application's logs and traces into Sazabi with OpenTelemetry — pick the SDK for the runtime, export over OTLP/HTTP to a Sazabi intake URL kept in an environment variable, and prove data arrives before calling it done. Use when the user wants to connect an app or service to Sazabi, add OpenTelemetry, set up logging or tracing, or asks why Sazabi shows no data for a service.
argument-hint: the service or app to instrument, and where it runs
allowed-tools: mcp__sazabi__search, mcp__sazabi__execute
---

# Data in, proven

Sazabi can only answer questions about telemetry it receives. The job is to
make the app export logs and traces over OpenTelemetry to the user's Sazabi
project, with no secrets in the repo, and to show the first records arriving.

## 0. How the tools work

The Sazabi MCP server lists only two tools, `search` and `execute`. Browse
Sazabi's operations with `search` and `namespace: "sazabi"` (an empty query
without a namespace lists connected connectors, not Sazabi operations). Before
calling one, repeat `search` with `namespace: "sazabi"`, the hit's full name as
the query, and `includeInputSchema: true` to load its arguments. Then run it
with `execute` as `{ name, arguments }`, the name copied from the hit (for
example `sazabi/logs.ask`).

## 1. Get an intake URL

Run `sazabi/logSources.list` first; an OpenTelemetry source may already exist
for this project. If not, `sazabi/logSources.create` in manual mode for an
OpenTelemetry source returns the intake endpoint to point the sender at. The
intake URL embeds a write-only public key, so it needs no auth header, but it
still belongs in an environment variable or secret store, not in committed
code. Metrics go to the separate OpenTelemetry Metrics source, which has its
own intake path.

## 2. Wire the SDK

Use the official OpenTelemetry SDK for the runtime and initialize it before the
app handles requests:

- **Node.js:** `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`,
  `@opentelemetry/exporter-trace-otlp-proto`, `@opentelemetry/exporter-logs-otlp-proto`
  and `@opentelemetry/sdk-logs`. Auto-instrumentation exports traces but not
  logs, so add a `BatchLogRecordProcessor` with an `OTLPLogExporter`, and
  bridge the app's existing logger (pino, winston) instead of replacing it.
- **Python:** `opentelemetry-distro` and `opentelemetry-exporter-otlp-proto-http`,
  then `opentelemetry-bootstrap -a install`, and enable the logging handler.
- **Other runtimes:** the standard OTLP/HTTP exporter for that SDK.

Configure through the standard environment variables, set in the process that
runs the app (not only at build time or in CI):

```bash
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=<intake URL>
OTEL_SERVICE_NAME=<service name>
```

Set `OTEL_SERVICE_NAME` and `deployment.environment` so every record says
which service and environment it came from. Add the variable names to
`.env.example` or the deploy config, with the value left to the user.

## 3. Prove it

Run the app (or deploy it), make a request, then ask Sazabi with
`sazabi/logs.ask`: "how many records from service `<name>` in the last 15
minutes". Records usually show up within a minute or two. If none arrive,
check that the variables are set in the running process, that the URL has its
`https://` scheme, and the app's output for SDK initialization errors.

## 4. Hand off

Commit on a branch and open a pull request. Say which signals are flowing
(logs, traces), which service name to search for, and which variables the
user must set in each environment.

## Anti-patterns

- **Committing the intake URL.** It is a write key; keep it in configuration.
- **Traces only.** Most debugging starts from log lines; export both.
- **Calling it done before a record arrives.** Configuration that has never
  delivered a record is a guess.
