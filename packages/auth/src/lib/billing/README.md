# Billing sources

Current plan access belongs to the configured billing provider. With
`BILLING_PROVIDER=autumn`, an organization's Autumn flags grant access even when
there is no Stripe subscription or local `subscriptions` row. A stale active
Stripe row cannot override an Autumn free plan.

Use `organizationPlan(id)` or `organizationPlans(ids)` from
`@superset/auth/billing` for access decisions. Batch reads deduplicate organizations
and limit concurrent Autumn reads to ten. `organizationActivePlan(id)` supplies the
existing client billing response. The tRPC billing helper re-exports the plan
reader for existing server callers. `organizationBilling` is the detailed Autumn
snapshot, including plan family, payment state, trial end, and billed seats.

Do not join membership to `subscriptions` to decide access. Check membership,
then read the plan. The previous membership/subscription helpers were removed.
`billing-sources.test.ts` rejects new application reads of the projection outside
this package and the reviewed exceptions below.

## Source audit, 2026-11-19

| Consumer | Current source and treatment |
| --- | --- |
| Web, desktop, and mobile plan labels/paywalls | `billing.activePlan` or the custom session, both provider-aware. The web integrations redirect checks resolved access before opening a paywall. |
| GitHub and Linear connect/install/callback/reconnect | Shared async integration policy uses the canonical plan reader. |
| Integration suspension/resume, Linear webhook acceptance/fanout, and token refresh | Same async policy; no SQL predicate that grants current access from Stripe rows. Suspension checks run in bounded batches with saved cursors. |
| Automation create/run/resume, schedules, dispatch, and trigger gates | Canonical single/batch plan readers. |
| Cloud workspace and environment gates | Existing Autumn machine-size and environment entitlements; shared plan reader where a tier is needed. |
| Slack agent messages | Canonical plan reader. |
| Organization member limit and enterprise billing restrictions | Canonical plan reader. |
| Support feedback and account lookup | Current provider plan/status; Autumn trial dates and seat licenses rather than a stale projection. |
| Member add/remove and shared-organization account purge | Autumn seat sync runs before any local subscription-row condition. |
| Organization deletion and sole-member account purge | Cancel Autumn plans even without Stripe IDs. An Autumn lookup failure aborts deletion instead of being treated as no plan. |
| Released clients' billing adapters | Current state comes from Autumn when it owns a plan. Stripe references remain available for existing portal flows and unmigrated subscriptions. Autumn-only cancellation/restore no longer requires a Stripe ID. |
| Checkout's enterprise protection | Autumn's held plan takes precedence over an obsolete enterprise projection. Existing Stripe subscriptions still prevent duplicate checkout for unmigrated organizations. |
| Renewal/payment messages and cancellation-feedback jobs | Stripe owns invoice amounts and the event's subscription identity. Autumn supplies current plan names and detects an Autumn-only resubscription before cancellation follow-up. |

## Reviewed projection reads

- `server.ts` and `load-custom-session-data.ts`: legacy-provider session reads,
  Stripe identifiers and invoice previews for billing notifications, and seat
  writes for subscriptions not yet managed by Autumn. Autumn seat sync happens
  first. Session SQL skips subscription reads in Autumn mode.
- `account-purge/purgeAccount.ts`: unmigrated Stripe seat updates and final
  financial cleanup after Autumn cancellation.
- `support/lookup/route.ts`: legacy-provider metadata and the Stripe subscription
  identifier; current Autumn status, dates, and seats override the projection.
- Stripe `notify-slack` and `cancellation-feedback` jobs: identify the historical
  subscription named by an event. These rows do not grant application access.
- `integration-grace.ts`: canceled subscription history retains the existing
  seven-day integration grace period. This is separate from current paid access;
  active rows do not grant access in Autumn mode. Autumn-only plans without
  recorded Stripe cancellation history do not gain this historical grace.
- Billing projection, legacy adapters, Stripe event handling, development seeding,
  and migration scripts: financial identity, compatibility, and historical data.

Stripe invoice/portal/history reads are intentional. They must not become a
fallback for current entitlements. Keep mutation ownership checks strict: an
Autumn outage is not evidence that Stripe should own a write.

No database schema or released tRPC input/output shape changes are required.
