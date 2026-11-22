# Sandbox

What every client needs to reach a cloud workspace's box. The server
lifecycle (provider, boot, wake, credentials) is in
`packages/trpc/src/lib/sandbox/`.

| File | What it holds |
|---|---|
| `gate.ts` | Gate tickets, host secret, gate URLs |
| `contract.ts` | Paths, ports and keys shared by the API, host-service and the box |
| `regions.ts` | Provider regions |
| `access.ts` | `createSandboxAccess`: one grant per workspace, address vs wake, one wake at a time |
| `reach.ts` | `callWithWake` for one call; `probeSandboxHost`, `isSandboxStopped` |
| `watch.ts` | `watchForStoppedSandbox` for a socket that stays open |

## The rule

Use a box at its address first. When nothing answers there (the gate returns
`410` for a stopped box), ask for one wake, then try again. Never repeat a
call the box answered, and never wake a box only because it is listed.

| Client | Uses |
|---|---|
| Desktop | `createSandboxAccess`, `watchForStoppedSandbox`, `probeSandboxHost` |
| Mobile | `createSandboxAccess` |
| CLI, MCP | `createSandboxAccess`, `callWithWake` |
| SDK | Its own copy: it is published to npm without internal packages |

Keep this folder free of React and of new dependencies: the CLI, MCP and the
gate import it too.
