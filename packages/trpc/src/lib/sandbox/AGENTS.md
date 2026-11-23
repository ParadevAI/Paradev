# Cloud workspace sandboxes

This directory provisions and bootstraps the Vercel sandboxes that back cloud
workspaces, and mints the tickets clients present at the sandbox gate
(`access.ts`). The gate itself is the Worker in `apps/gate`; the desktop half
lives in `apps/desktop/src/renderer` (the sidebar's cloud section,
`SandboxAccessProvider`, the host fan-out); host-service inside the sandbox
checks the secret the gate presents with the same `PskHostAuthProvider` a
local host uses; and the image and bundle are `packages/sandbox` — a change here
usually needs one of those too.

Habits that pay for themselves here:

- **Verify from the renderer, not from Node.** The renderer's CSP and the
  WebSocket auth sit between the app and a sandbox, and both fail as a generic
  `TypeError: Failed to fetch`. A script that succeeds from your terminal proves
  nothing about the app.
- **A host-service change reaches a box only through a release.** host-service
  is an asset row in `packages/sandbox/bundle/assets.json` that `bun run
  release` rewrites (and `bun run assets host-service` by hand); a merge to
  main changes nothing on any box. A fix that isn't in a published bundle is
  a fix that only exists on your machine.
- **The claim is the whole handoff.** `buildSandboxClaim` assembles what a box
  needs to be one workspace — the identity file, the firewall rules, the
  managed environment, the host secret — and `provisionSandbox` and
  `wakeSandbox` take it. A restart after promote is a wake (`wakeAfterStop`),
  so a create, a wake and that restart hand the box the same thing, and each
  new session gets a boot row.
