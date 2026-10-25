# Legacy billing code

Everything in this folder is deleted once its condition holds. Removing it is
"delete the file and its imports"; anything added here should be temporary.

| File | Exists because | Remove when |
|---|---|---|
| `stripe-routes-shim.ts`, `stripe-routes-shim-deps.ts` | Released desktops call the better-auth Stripe plugin's `/subscription/upgrade`, `/cancel`, `/restore` and `/success` routes, and the Stripe webhook is registered in Stripe | `MINIMUM_DESKTOP_VERSION` (`apps/api/src/app/api/desktop/version/route.ts`) is at or past the first desktop build on `/api/auth/autumn/*`, and PostHog shows no calls to the old routes from a live version in 30 days |
| `plan-ids.ts` | Translates `{ plan: "pro", annual }` from released desktops, and reads a tier from a Stripe price for subscriptions Autumn has not imported | Same version floor, and the flip to `BILLING_PROVIDER=autumn` is verified (import with no skips, `billing.verify` with no drift) |

The Stripe plugin itself (`BILLING_PROVIDER=stripe`) is the emergency fallback
until the flip is verified, then removed.
