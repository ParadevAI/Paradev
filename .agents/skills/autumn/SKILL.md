---
name: autumn
description: Change customer billing through Autumn (plans, seats, trials, free access, coupons, credits) without breaking Stripe MRR, churn, or invoices. Use for any billing write for a customer, and when asked to give someone free access, a free trial, a work trial, free months, a comped plan, or usage credits.
---

# Autumn

Autumn owns subscriptions, seats, and discounts. It writes to Stripe, and the app reads Autumn.
A change made directly in Stripe leaves Autumn wrong, and Autumn's next invoice can then be wrong
too.

## Rules for every billing write

1. **Write through Autumn,** not the Stripe Dashboard or the Stripe API.
2. **Preview first** (`billing.preview_attach` or `billing.preview_update`). Show the user the
   amount due today, the date of the first charge, and its amount. Get a yes before you write.
3. **Read back after** with `customers.get`: plan status, `trial_ends_at`, and seats.
4. **Test anything new in the sandbox** (an `am_sk_test_` key). The sandbox uses a different Stripe
   account from the workspace `STRIPE_SECRET_KEY`.

Seat plans: `pro_v2` sells seats as the `pro_seat` license, `team` as `team_seat`, and `ultra` as
`ultra_seat`. Legacy `pro` uses the `seats` feature. Check with `plans.list` for other plans.

## Free access

Prefer a **trial** to a 100% coupon. Stripe Billing Analytics counts a trial as $0 MRR. A 100%
coupon applied when the subscription is created (a promotion code at checkout) is also counted as
$0, but only until a seat or plan change makes Autumn replace the subscription item. Stripe then
counts the new item at full price. On 10 November 2026 this had happened to 10 subscriptions
(about $2.2k MRR). Fixing them recorded the same amount as churn, and Stripe cannot remove churn
from its history.

Promotion codes for Autumn rewards (the YC deal flow) are acceptable until Autumn stops replacing
items; a trial is still the safer choice for anyone who will add seats.

| Who | Card | Use |
|---|---|---|
| Work trial, influencer, partner we pay, anyone we do not bill | No | No-card trial |
| Company that should convert to paid, including YC deal companies | Yes | Card trial |
| Free usage on top of a plan (cloud GB-hours) | — | Usage credit |

### No-card trial

```json
{
  "customer_id": "<organization id>",
  "plan_id": "team",
  "license_quantities": [{ "license_plan_id": "team_seat", "quantity": 3 }],
  "customize": {
    "free_trial": {
      "duration_length": 3,
      "duration_type": "month",
      "card_required": false,
      "on_end": "revert"
    }
  },
  "redirect_mode": "never"
}
```

Autumn runs this trial itself: no checkout link and no invoice, so MRR and churn do not change.
Seat changes during the trial cost $0. `on_end: "revert"` takes them off the plan when the trial
ends, and nothing is billed.

### Card trial

The same request with `"card_required": true`, `"on_end": "bill"`, and no `redirect_mode`. The
response has a `payment_url` (Stripe Checkout). Send that link. They pay $0 today and the plan
price when the trial ends.

### Usage credit

Grant a balance with `balances.create` (feature `box_gb_minutes`). Do not discount the plan.

## Do not

- **Do not create coupons or promotion codes in the Stripe Dashboard.** Autumn does not know them,
  and its seat-change invoices then credit the customer at full price for seats that were free.
  Create rewards in Autumn.
- **Do not convert an existing paying subscription to a trial,** and do not add a 100% coupon to
  one. Stripe records the MRR drop as churn. To give a paying customer free months, ask the user
  first; an invoice credit (credit note or customer balance) keeps MRR and churn true.
- **Do not add a coupon to a subscription that already exists.** Stripe MRR does not recalculate,
  so the subscription stays counted at full price.

## Known Autumn issues

Reported in #ext-autumn on 10 November 2026:

- On subscriptions imported with `billing.import`, each seat change can credit earlier seat blocks
  again. Customers get credit they are not owed.
- When `billing.update` replaces a subscription item, Stripe MRR stops applying the
  subscription's discount to the new item.

## Not yet tested

- Extending or shortening a trial that is already running.
- Usage credits (`balances.create`) and how they show on invoices.
- The YC deal flow still emails promotion codes for the `yc-bookface-3mo-team` reward
  (`apps/api/src/app/api/integrations/yc-deals/webhook/`). Moving it to a card trial is a code
  change in checkout.
