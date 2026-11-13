# Adding an environment variable

Five places. Miss one and it fails silently, or far from the change.

## 1. Set the secret

```bash
gh secret set MY_VAR -R paradevai/paradev --body "value"
```

Always a secret, never a repo variable, even for something as unsecret as a
bucket name — one mechanism means one place to look when a value goes missing.

Add `--env Production` / `--env Preview` only when the two need different
values. Without it, both environments get the same one. Scoping works because
every deploy job declares `environment: production` / `preview`; a job that
does not will read an environment secret as empty. It is also why a one-off
script that needs a production secret has to run as a workflow; see
`docs/deploy-workflows.md`.

Give both environments the **same name** and different values. A separate
`MY_VAR_DEV` variable is easy to reference in a workflow and forget to create,
and it fails as an empty string at boot rather than as a missing key.

## 2. Add it to the schema

`packages/trpc/src/env.ts`, or the app's own `src/env.ts`.

```ts
MY_VAR: z.string().min(1),
```

Required by default — a deployment missing it should fail at boot, not on the
first request that reads it. `.optional()` is for a variable with a real
fallback, or one a whole runtime genuinely lacks (desktop, mobile, CLI). Never
pair `.optional()` with an `if (!env.X) throw`: that is required in disguise.

## 3. Both templates

- `.env.example` — empty value, documents what production needs.
- `.env.local.example` — fake working value (`fake-r2-access-key-id`,
  `superset-private-dev`). Local should boot with no real credentials.

The fake value must satisfy the schema: a URL for `z.string().url()`, 32+
characters for `.min(32)`. Setup copies it into any worktree `.env` that lacks
the key (see 4), and then loads both schemas against the result, so a value
that fails validation fails setup.

Leave the value **empty** only for a key that should stay unset locally
(`CLOUDFLARE_BROWSER_RENDERING_TOKEN`, the APNs keys). Setup never seeds an
empty value.

## 4. The root `.env`

`setup.local.sh` seeds `.env` from `.env.local.example` only if `.env` does not
exist, and `setup.sh` copies the **root checkout's** `.env` into every new
worktree. Either way, setup then appends every key that has a value in
`.env.local.example` but none in the worktree's `.env`, right after it writes
the port block, and re-running setup without `--force` fills the gaps in an
existing worktree. Existing values are never overwritten; an empty `KEY=`
counts as missing.

So a worktree boots with the fake value until the root `.env`
(`~/code/superset/.env`) carries a real one. Add the key there when the feature
needs the real service locally, and tell the team to do the same.

## 5. Both deploy workflows

Two edits each, in `deploy-production.yml` and `deploy-preview.yml`. With only
the first, the value reaches the runner and never reaches the app.

```yaml
MY_VAR: ${{ secrets.MY_VAR }}     # the job's env: block
```
```yaml
--env MY_VAR=$MY_VAR \            # the deploy command's passthrough
```

Both reference `${{ secrets.MY_VAR }}`; the environment picks the value.

A reusable workflow (`on: workflow_call`, e.g. `build-cli.yml`) inherits `vars`
automatically but **not** `secrets` — the caller must pass `secrets: inherit`,
or the value arrives empty.

## Checklist

- [ ] `gh secret set`
- [ ] Schema, required unless it has a real fallback
- [ ] `.env.example` empty, `.env.local.example` fake and schema-valid
- [ ] Root `.env` when the feature needs the real value locally, and the team told
- [ ] `deploy-production.yml`: `env:` block **and** `--env`
- [ ] `deploy-preview.yml`: same two

## Launcher-owned runtime values

`SUPERSET_HOST_INSTALL_SOURCE` is set by the desktop coordinator (`desktop`) or standalone CLI spawner (`cli`) on the host child process. A checkout may set `dev`; absent/unrecognized values report `unknown`. This is install provenance, not an API deployment setting: do not put it in shared `.env` templates or deployment secrets. The host ignores login-shell values for this key. In-place updates additionally require a standalone entrypoint and a valid install layout.

`SUPERSET_AGENT_LAUNCH_ID` is set by the outer agent wrapper to a process-and-start-time identifier. Hook children inherit it so a new launch in the same terminal cannot inherit the previous login attribution. It is runtime metadata, not a deployment secret or user setting; it does not belong in `.env` templates or deploy workflows.

`SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN` is issued by the host for each new terminal and authorizes only that terminal’s login-attribution hook metadata. It is not the host authentication token. Tokens expire when the host process restarts; open a new terminal to restore verified login attribution. The host injects it at PTY creation, so it does not belong in deployment configuration.

`SUPERSET_HOST_AUTO_UPDATE` is a standalone host runtime preference, set to `true` by `superset start --auto-update` and `false` otherwise. Direct service launchers may set it explicitly. It defaults to `false`, is excluded from login-shell imports, and is inherited by update/rollback successors. Like install provenance, it does not belong in deployment secrets or shared environment templates.

`SUPERSET_SANDBOX_AGENT_AUTOMATION_RUN_ID` is an internal first-boot variable. Cloud automation dispatch sets it when it starts a workspace, and host-service sends it back with the launch report so the run is correlated without guessing which row created the box. A manual cloud launch must not set it. It is not a deployment secret: do not add it to `.env` templates, the API env schema, or deploy workflows.

`SUPERSET_SANDBOX_AGENT_TERMINAL_ID` is an internal first-boot variable. The desktop's create flow chooses the id, the API passes it with the launch, and host-service starts the agent's chat or terminal under it so the desktop can open that pane by the exact id. It is not a deployment secret: do not add it to `.env` templates, the API env schema, or deploy workflows.

## Browser OAuth origin

`BROWSER_API_URL` is an optional server setting in API, auth, and tRPC. It falls
back to `NEXT_PUBLIC_API_URL`, including when a deploy passes an empty secret.
Leave it unset in the existing stack and local development. It selects auth's
base URL, integration OAuth redirect URIs, state-cookie transport, and browser
account-link URLs. OAuth token exchanges must send that same redirect URI.
`NEXT_PUBLIC_API_URL` remains the JWT issuer/audience, MCP resource identity, and
server job/callback origin. `PLUGIN_CLIENT_METADATA_BASE_URL` still controls
where providers fetch connector client metadata.

The API and web preview workflows pass the optional setting through. Production
workflow wiring is deferred to the separate-deployment change, so this preparation
does not trigger infrastructure redeploys through workflow path filters. No secret
or local `.env` change is needed for the existing stack. The web client's public API URL remains its own
`NEXT_PUBLIC_API_URL`; `BROWSER_API_URL` is not bundled into browser code.

OAuth/OIDC discovery keeps the explicit canonical issuer but advertises protocol
endpoints (authorize, token, JWKS, registration, introspection, revocation,
userinfo, logout) on the deployment's browser base URL. With no override these
are unchanged. The MCP resource is always `${NEXT_PUBLIC_API_URL}/mcp`, including
root and plugin discovery, while discovery URLs can use the request host.
Connector client metadata keeps its stable client ID and accepts callback twins
on our own domains. Existing dynamic-client grants look up their original client
across those callback twins, scoped to the same issuer and connector; new grants
still select registrations for the current callback only.

## Domain move opt-in

`DOMAIN_MOVE_ENABLED` is optional in API and web, and only literal `true` enables
the routing flag lookup. Every other value defaults to the existing behavior,
without a rollout cookie or added remote lookup. It is server-only and included
in Turbo's env inputs and API/web preview/manual build/runtime passthrough.
The web proxy reads this optional string directly from `process.env` so its
auth gate does not load the full app environment schema. The API reads its
declared server environment value.
Production passthrough is required in a separately approved activation change. No
secret or local `.env` value is set by the inert preparation change. Stage and
final artifact preparation explicitly pass `false`. See
[the cutover handoff](paradev-staging.md#inert-domain-cutover-preparation) before
any future activation, including its merge/deployment warning.
