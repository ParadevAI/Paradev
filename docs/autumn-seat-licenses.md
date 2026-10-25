# Seats and cloud hours in Autumn

Self-serve plans sell seats as Autumn licenses. Each seat brings its cloud
GB-minutes into one pool the whole team shares. Autumn does the arithmetic; our
code only keeps the seat count equal to the member count.

## Catalog shape

Per family and interval there are two plans:

- A **seat license plan** (`pro_seat`, `team_seat_annual`, ...) in its own
  group. Its base price is the seat price, and it holds one item:
  `box_gb_minutes` with the per-seat grant, a monthly reset and `pooled: true`.
- A **parent plan** (`pro_v2`, `team`, `ultra_annual`, ...) in the `main`
  group. It links the license plan under `licenses` with `included: 0`, and
  holds the overage item (`box_gb_minutes`, `included: 0`, usage-based price),
  `environments` and `pro_access`. Its metadata places it in the lineup:
  `self_serve: true`, `family`, `display_order`.

Autumn rejects a pooled item with a usage-based price, which is why the grant
and the overage price are separate items on separate plans.

The pool is `paid licenses × per-seat grant`. It does not depend on licenses
being assigned to entities, so we never assign them.

`pro` and `pro_annual` are the retired Pro plans: one flat grant and a `seats`
feature quantity. Existing subscribers stay on them until they are moved. They
carry `family: pro` without `self_serve`, so the catalog shows them as Pro but
never sells them.

## Seat changes

`setAutumnSeats` in `packages/auth/src/lib/billing/autumn/seats.ts` runs on
every member change:

| Members vs paid seats | Call |
|---|---|
| More members | `billing.update` with the new `licenseQuantities` (prorated now) |
| Fewer members | `billing.createSchedule`: keep the paid count now, the member count at `currentPeriodEnd`, `prorationBehavior: none` |
| A decrease is pending and seats are needed again | `billing.createSchedule` with only a `now` phase, which replaces the pending one |

A removed seat therefore stays paid, and its GB-minutes stay in the pool, until
renewal. While a schedule exists Autumn refuses `billing.update` on that
plan, so every change made then goes through `createSchedule`.

Retired Pro plans keep the old path: the `seats` feature quantity, with no
credit on a decrease.

## Cloud access

Billing state exposes `planTier`: the plan's `family` in Autumn (pro, team,
ultra; the retired Pro plans read as pro), else the entitlement tier (free,
enterprise). The `cloud-workspaces` PostHog flag is the gate. The server passes
`plan_tier` for the active organization as a person property when it evaluates
the flag, and the desktop sets it with `setPersonPropertiesForFlags` and stores
it on the person for analytics. The flag's release condition `plan_tier` in
`team, ultra` is what turns cloud on for those plans; the tier names live in
PostHog, not in code. Pro's seat license has no GB-minutes.

## Extra GB-hours

A plan sells extra GB-minutes through a one-off prepaid `box_gb_minutes` item:
`interval: one_off`, `billing_method: prepaid`, `billing_units: 60`, `amount: 0.06`
($0.06 per GB-hour, the overage rate). They never expire and are used after the
monthly pool. Owners pick or enter a whole number of GB-hours from 100 to 30,000
(`GB_HOUR_PURCHASE`), and `gbHourPurchase` rounds it up to whole units of the
subscribed plan version's item.

- Buying: `POST /autumn/buyGbHours` (owners) sends `billing.update` with
  `featureQuantities` of the GB-minutes bought. The quantity is the amount to
  buy, not a new total, so purchases stack.
- Auto top-up: `POST /autumn/setAutoTopup` (owners) writes the customer's
  `billingControls.autoTopups` (threshold in GB-minutes, the GB-hours to buy per
  top-up, at most 10 a month). Autumn fires it when a tracked event takes the balance below
  the threshold; one large event that jumps straight into overage does not.
- Past the monthly pool and the bought hours, usage is overage at the plan's rate.

## Plan changes

Clients call `POST /autumn/previewAttach` and show the charge in their own
confirm dialog, then `POST /autumn/attach` with `confirmed: true`, which uses
`redirectMode: "if_required"`: Autumn charges the saved card with no page in
between, and only a customer without a card goes to Stripe Checkout. Without
`confirmed` (released clients) attach keeps `redirectMode: "always"`, so those
clients still get Autumn's confirm page instead of being charged without one.

A downgrade from a yearly plan would otherwise switch at the end of Autumn's
monthly period, leaving the rest of the paid year unused. When the current
plan's seats are yearly and Autumn schedules the change, preview and attach pass
`startsAt` at the yearly renewal (`yearlyChangeStart`), so the old plan runs
until its renewal. "Keep" (`cancel_action: uncancel`) removes the scheduled plan.

## Known Autumn behavior

- Switching plans (retired Pro to Pro, Pro to Team) resets the pool's usage
  even though `previewAttach` reports `resets_usage: false`. To raise with Autumn.
- autumn-js 1.3.55 drops `licenses` from plans and has no `licenses.list`, so
  `autumnRest` in `packages/auth/src/autumn.ts` reads both over REST. Remove it
  when the SDK models them.
