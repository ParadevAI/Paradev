# Writing deploy workflows

Four things about `.github/workflows/` that surprised us during the 17 September 2026 outage and
its follow-through. Migration safety itself is in `.agents/skills/db-migrations/SKILL.md`; adding
a variable to the deploys is in `docs/environment-variables.md`.

## A piped `run:` step hides failures

| The step sets | GitHub runs it with | `cmd \| tee log` returns |
| --- | --- | --- |
| nothing (the default) | `bash -e {0}` | tee's status, so always success |
| `shell: bash` | `bash --noprofile --norc -eo pipefail {0}` | `cmd`'s status |

On 2026-09-19 this reported a failed production migration as a success and let the app deploys
start against an unmigrated database.

- Put `set -o pipefail` at the top of any `run:` block that pipes.
- When testing a step locally, copy the `shell:` line from a real run log. Do not assume
  `pipefail`.
- Where a false success is expensive, check the outcome as well as the exit code.
  `packages/db/src/verify-migrations-applied.ts` does this for migrations.

## Production secrets exist only in GitHub

Secrets such as `SECRETS_ENCRYPTION_KEY` and `DATABASE_URL` live only as GitHub `production`
environment secrets. The deploy injects them into Vercel with `--env`; the Vercel project env is
nearly empty.

Anything that needs a production secret must run as an Actions workflow with
`environment: production`. `.github/workflows/backfill-connections.yml` is the pattern: manual
dispatch, dry run by default, writes only when the `apply` input is checked.

## One run shows about ten deployment rows

Every job that declares `environment: production` creates its own row on the GitHub Deployments
page. That is cosmetic.

## Wait after `gh workflow enable`

Dispatching a workflow within a second of `gh workflow enable` produced a run stuck "queued" with
zero jobs. It could not be cancelled, force-cancelled or deleted. Wait about 20 seconds after
enabling before you dispatch.

## Previews with shared browser cookies

Add the `domain-preview` PR label before pushing an update to deploy these
isolated browser hosts:

- `pr-<number>.paradev.com`: marketing
- `app.pr-<number>.paradev.com`: web
- `api.pr-<number>.paradev.com`: browser API and OAuth callbacks

Auth cookies use `pr-<number>.paradev.com`. The API keeps its original
`api-pr-<number>-superset.vercel.app` identity and alias; `BROWSER_API_URL`
selects the owned browser host. The web build calls that browser host.
Other previews retain their existing settings. These builds use the preview
database branch and preview credentials, not production configuration.

Register the exact browser callback with the provider before testing OAuth.
Custom domains fix cookie scope; they do not remove provider allowlists.
An OAuth proxy or a fixed staging callback is a separate requirement for
sign-in on arbitrary PRs without registering each callback. Do not use
`Domain=vercel.app`: it is a public suffix and browsers reject that cookie.

Use a separate browser profile for analytics tests: PostHog's existing cookie
name is shared across `paradev.com`. Confirm the Preview PostHog project receives
the events. Keep the label until the PR closes so cleanup removes the three
owned-domain aliases. Remove temporary provider callback registrations after
the test.
