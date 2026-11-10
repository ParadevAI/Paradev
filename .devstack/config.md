---
devstack: config/1
base_branch: main
plans_dir: plans
tracker: linear
checks:
  fix:
    - bun run lint:fix
    - bunx sherif --fix
  verify:
    - bun run lint
    - bun run typecheck
    - bun run test
    - bun run check:i18n
    - bun run check:plugins
    - bun run check:versions
    - bun run check:durable-objects
pr:
  draft: false
  assignees: [superset-home]
  labels: []
roles:
  coder: claude
  reviewer: codex
max_workers: 4
---

# devstack conventions for paradev

Plans go where the work lives: `apps/desktop/plans/` for desktop work, `apps/mobile/plans/` for
the mobile app, `apps/marketing/plans/` for the marketing site, and `plans/` for shared packages,
plugins, or work across apps. A plan moves to `done/` in the PR that completes it.

A change to `apps/marketing` content also needs `bun run lint:prose` in `apps/marketing`, which
runs Vale; CI installs it, so install Vale locally or rely on CI for that check.

Assigning a PR to `superset-home` starts an automated review in a cloud workspace. It publishes
its findings as a Paradev page and links it in a PR comment; address those findings before you
ask for a human review.

Reviews check the diff against `AGENTS.md` and the nested one for each touched app. Before a
change in these areas, read the matching guide:

- tRPC procedures (`packages/trpc`, `packages/host-service`): `packages/trpc/AGENTS.md` and the
  `trpc-compat` skill. Released desktop, mobile and CLI builds still call them.
- Database schema (`packages/db`): the `db-migrations` skill. Never hand-edit `packages/db/drizzle/`.
- User-facing strings: Lingui, per the Internationalization section of `AGENTS.md`;
  `check:i18n` must pass with every locale translated.
- Plugins (`plugins/`): `docs/plugins.md`; publish with `superset plugins publish <name> --bump patch`.
- Environment variables: `docs/environment-variables.md`.

Tests stay fast: no real waiting, one test per behaviour, no retries. See the Tests section of
`AGENTS.md`.
