# Stripe cards: interaction matrix

Every interaction of the six Stripe cards, done in the Stripe Dashboard and in the running desktop
dev app, then compared. Both sides ran in the same Stripe **sandbox** (`acct_1TRPKa5GN2XwxcTZ`, the
Dashboard under `/test/` with the Sandbox header, the cards on an `sk_test_` key). The Dashboard was
driven over CDP: each dialog was opened on an untouched reference customer, its fields, defaults,
validation and wording were recorded, and it was cancelled. Our side ran each action for real on a
second set of test customers and read the result back from Stripe's API.

Headless tests behind these rows: `stripeCards.test.ts`, `stripeClient.test.ts` (API), and the
`Stripe*Block.test.tsx` files (UI).

`[x]` same as Stripe · `[-]` not comparable or not offered, with the reason

## Refund

| | Interaction | Stripe Dashboard | Ours |
|---|---|---|---|
| [x] | Amount default | the full refundable amount | the same, or the agent's amount when it is less |
| [x] | Partial refund | type a smaller amount | the same |
| [x] | More than is left | "Amount cannot be more than $75.00." | the same sentence; the server refuses it too |
| [x] | Zero | "Amount cannot be $0.00." | the same sentence |
| [x] | Reason | "Select a reason": Duplicate, Fraudulent, Requested by customer, Other | the same four; Other sends no reason, as the API has none for it |
| [x] | Fraudulent | warns that the payment method and email go on the block lists; button "Refund and block" | the same sentence and button (shown, not run live: it changes the sandbox block lists) |
| [x] | Confirm | the dialog is the confirm | a confirm with the amount, the charge, the customer and the card |
| [-] | Internal note | "Note", shown on the payment | not offered: the API has no payment notes |
| [-] | "Refunds take 5–10 days…" | shown above the form | not shown: the card has no help text |
| [-] | Also cancel a subscription, reply on the email thread | separate pages | one action on the card; the confirm names each |

## Cancel subscription

| | Interaction | Stripe Dashboard | Ours |
|---|---|---|---|
| [x] | When | Immediately (today's date) / End of the current period (its date) | the same two, with the dates |
| [x] | Default | Immediately, No refund | the same, unless the agent proposed another |
| [x] | Refund options | No refund / Last payment $20.00 / Prorated amount $19.75 of $20.00 (the amount falls by the second) | the same order and wording, from Stripe's own preview |
| [x] | At period end | refund options are replaced by "You can't issue a refund here when canceling at the end of the period…" | the same sentence |
| [x] | Buttons | Don't cancel / Cancel subscription | the same |
| [-] | On a custom date | date picker | not offered: left to the Dashboard |
| [-] | Credit note for the refund | Stripe issues one | the card refunds the charge; no credit note |
| [-] | "Send refund receipt" | checkbox | not offered |

## Pause and resume

| | Interaction | Stripe Dashboard | Ours |
|---|---|---|---|
| [x] | Duration | Indefinite / Until a custom date | the same |
| [x] | Custom date default | the end of the current period | the same |
| [x] | Invoice behavior | Keep invoices as drafts / Mark invoices uncollectible / Void invoices | the same order and wording |
| [x] | Default | Indefinite, Keep invoices as drafts | the same |
| [x] | Button | Pause | Pause |
| [x] | Resume | "Resume payment collection" in the subscription menu, then "Are you sure you want to resume collecting payments?" | the same action, with a confirm that names the plan and the customer |
| [-] | "Pause subscription" with credits | Stripe's newer pause, which stops the subscription and credits the customer | not offered: the card pauses collection only |

## Coupon, credit, trial

| | Interaction | Stripe Dashboard | Ours |
|---|---|---|---|
| [x] | Coupon list | "Sorry for the trouble (card test) – 25% off for 3 months" | the same wording |
| [x] | Stacking | coupons stack; one more is added to those the subscription has | the same; one it already has is refused |
| [x] | Credit: balances | Starting balance $0.00, New balance ($25.00) | the same two lines, the new one worked out as you type |
| [x] | Credit: type | Adjustment type: Credit / Debit | the same |
| [x] | Credit: amount and note | Amount, internal note | the same |
| [x] | Credit: button | Apply to credit balance | the same |
| [x] | Trial | "Free trial days" with "Ends Oct 17, 2026" | the same field and line |
| [-] | Promotion codes, new coupons | separate pages | left to the Dashboard |
| [-] | Reordering stacked coupons | drag | not offered |

## Failed payment

| | Interaction | Stripe Dashboard | Ours |
|---|---|---|---|
| [x] | Action | "Charge customer" | "Charge customer" |
| [x] | Amount | "Amount due $20.00 USD" | the same |
| [x] | Payment method | the method Stripe will charge, with its expiry | the same method |
| [x] | Decline | the invoice shows "Payment failed" | the decline reason in Stripe's words, attempts, next attempt |
| [-] | Internal note | "Add a note…" | not offered |
| [-] | Update-card link by email | "Share payment update link" on the subscription | a drafted email with the hosted invoice link, sent from Gmail |

## Dispute

| | Interaction | Stripe Dashboard | Ours |
|---|---|---|---|
| [x] | Summary | amount, reason, days to respond | the same |
| [x] | Accept | "By accepting the dispute you will lose this dispute and refund the customer. This closes the dispute and you will no longer be able to submit evidence." | the confirm says the same |
| [x] | Counter | "Countering this dispute has a fee in addition to the dispute fee. You'll get it back if you win." | the submit confirm says the same |
| [x] | Evidence: customer | Email, Customer name, Billing address | the same three |
| [x] | Evidence: product | product description, access activity log | the same, with service date and additional information |
| [x] | Save | "The evidence you provide is saved and automatically submitted when due." | Save draft, and the notice says Stripe submits it at the deadline |
| [x] | Inquiry | "There was an inquiry on this payment"; Refund customer / Respond to inquiry; no accept | the same two actions; no accept; the refund confirm says no money has moved |
| [x] | Inquiry refund | "Fully refunding this charge will automatically resolve the dispute." | the confirm says a full refund resolves the inquiry; afterwards the card reads "Inquiry closed" |
| [-] | File uploads | receipts, signatures, communication | uploaded in the Dashboard; the card links there |
| [-] | "Why should you win" and product type questions | step 1 of the form, which picks the recommended evidence | not asked: the agent drafts the fields |

## Invoice

| | Interaction | Stripe Dashboard | Ours |
|---|---|---|---|
| [x] | Send | "Send invoice"; a draft is finalized first | the same |
| [x] | Sandbox sending | "emails can only be sent to addresses with access to this sandbox" | the notice says Stripe emails no customer in test mode |
| [x] | Mark as paid | "Add an external payment" for the whole amount | marks it paid outside Stripe |
| [x] | Void | "You cannot undo this action." | the confirm says it cannot be undone |
| [x] | Mark uncollectible | "you'll only be able to change the status to paid or void" | the confirm says the same |
| [-] | Partial external payment, payment type, reference | fields of the wizard | not offered: the API takes "paid out of band" for the whole invoice |
| [-] | Apply existing payments, credit notes, edit a draft | wizard and editor | left to the Dashboard |
| [-] | Charge customer on an invoice | button | that is the failed-payment card |
