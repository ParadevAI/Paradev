# Stripe cards: parity checklist

Six inbox approval cards on the organization's Stripe account. Every card opens with the same
customer header (name, email, card on file, paid total, credit balance, subscriptions, recent
payments) and every write was run in the desktop dev app against a Stripe **sandbox**
(`acct_1TRPKa5GN2XwxcTZ`, an `sk_test_` key) and read back from Stripe's API. Every customer is test
data the agent made, tagged `superset_card_test`, with a `satya+…@superset.sh` address. No live
object was read or written.

The cell-by-cell comparison with the Stripe Dashboard is in `plans/stripe-card-matrix.md`.

Status: `[x]` verified in the running dev app against the sandbox · `[-]` not doing, with the reason. Nothing is open.

## 0. Safety

- [x] A live key writes only where Vercel says the deployment is production. Anywhere else (a dev machine, a preview deployment) every POST and DELETE is refused before a request leaves, and the card says "This Stripe key is live. Writes are off outside production; connect a test key" (`stripeClient.test.ts`)
- [x] Only an owner or admin of the organization can connect Stripe, see a Stripe card or act on one
- [x] A confirmed action runs only when the sentence the reader confirmed is still the sentence the server would show; the dialog freezes its sentence when it opens
- [x] In test mode, and with a live key where writes are off, a customer email goes only to the reader's own address or a plus-alias of it; an address field that holds two addresses is never mailed
- [x] A write that Stripe may have taken but did not answer says so, and a second click does not repeat it (refunds and credits are found by the card's id in Stripe's metadata; other writes carry an idempotency key)
- [-] Stopping an agent that holds the sender's session from approving its own card: not a Stripe rule. `inbox.act` treats sender and recipient alike for every card type, and a rule for Stripe alone would be a second way to do it. It is Satya's call for the whole inbox; the Stripe cards add the owner-or-admin check above on top

## 1. Customer header (all six cards)

- [x] Name, email, link to the customer in the Dashboard, card on file ("Visa •••• 4242" or "No card on file")
- [x] Paid: succeeded charges less refunds, shown as a floor ("$1,240.00+") when the customer has more than 100 charges
- [x] Credit balance when not zero; "Delinquent" tag
- [x] Subscriptions: product, price per period over all items, status, renewal / trial end / cancel date / pause
- [x] Recent payments: date, amount, status, card, refunded amount, disputed
- [x] "Test mode" tag and the account name on every card
- [-] Lifetime value as Stripe's Billing analytics computes it: the card shows what was paid, and says so

## 2. Refund (`stripe.refund`)

- [x] Full or partial amount, preset to the agent's amount and capped at what is left to refund
- [x] Reason, as the Dashboard lists it: Duplicate, Fraudulent, Requested by customer, Other. Fraudulent shows Stripe's block-list warning and the button reads "Refund and block"
- [x] Validation in Stripe's words: "Amount cannot be more than $75.00.", "Amount cannot be $0.00."
- [x] "Also cancel" a subscription of the same customer, in the same action
- [x] The email the request came by, with a drafted reply that is sent on the Gmail thread after the refund
- [x] Confirm states amount, charge amount, customer, card, the cancellation and the reply recipient
- [x] More than is left is refused; a fully refunded charge offers nothing
- [x] A refund that went through before a later step failed is finished without a second refund
- [-] Refund to a different payment method, and refunding application fees or reversing transfers (Connect): left to the Dashboard

## 3. Cancel or pause a subscription (`stripe.subscription`)

- [x] Cancel immediately or at the end of the current period, with the date
- [x] On immediate cancel: no refund, prorated refund or the last payment, each with its amount from Stripe's own preview
- [x] The refund is the amount the reader confirmed, or the action is refused
- [x] Defaults as in the Dashboard: Immediately, No refund; at period end the refund options give way to Stripe's sentence; buttons "Don't cancel" / "Cancel subscription"
- [x] Pause payment collection, Indefinite or Until a custom date (default: the period end); invoice behavior in the Dashboard's order, Keep invoices as drafts first and by default
- [x] Resume payment collection, with a confirm as in the Dashboard
- [x] Confirm states the plan, customer, date, refund amount and card
- [-] Cancel on a custom date and a cancellation reason or comment: left to the Dashboard
- [-] Subscription schedules: a scheduled subscription is changed in the Dashboard

## 4. Coupon, credit, trial (`stripe.adjust`)

- [x] Coupon: the account's valid coupons with their terms; added to the discounts the subscription already has; one it already has is refused
- [x] Credit balance: Starting balance and New balance, Adjustment type Credit or Debit, amount and note, "Apply to credit balance"; changes the customer balance by exactly that amount, in the customer's currency
- [x] Trial: "Free trial days" with the end date under it; later than the time the customer already has; no proration
- [x] Confirm states the terms or amount, the customer and the plan
- [-] Promotion codes and creating a new coupon: left to the Dashboard

## 5. Failed payment (`stripe.failed_payment`)

- [x] The invoice, the decline reason in Stripe's words, attempts, next automatic attempt
- [x] "Charge customer" charges what remains to the payment method Stripe will use (the invoice's, then the subscription's, then the customer's default); the confirm names both
- [x] A decline keeps the card open with Stripe's reason; a retry after the customer fixed the card is a new attempt
- [x] Send the update-card link: a drafted email with the hosted invoice page link, sent from the reader's Gmail
- [-] Changing the payment method for the customer: only the customer can enter a card

## 6. Dispute (`stripe.dispute`)

- [x] Amount, reason, status, deadline with days left
- [x] Evidence fields pre-filled: Stripe's stored evidence first, the agent's draft where Stripe has none, marked "Drafted"
- [x] Save draft (stays open, and the card says Stripe submits a saved draft at the deadline), Submit evidence (once; the confirm names the counter fee), Accept dispute (the confirm says the dispute is lost and the customer refunded)
- [x] Evidence fields include Billing address, as in the Dashboard's form
- [x] Past the deadline, or once answered, the card is read-only
- [-] File evidence (receipts, screenshots) and Visa compelling evidence: uploaded in the Dashboard; the card links there
- [x] An inquiry (`warning_needs_response`) is not a dispute yet: no Accept. "Refund customer" (the confirm says a full refund resolves it and no money has left the account) and "Respond to inquiry", as in the Dashboard; a closed one reads "Inquiry closed"

## 7. Invoice (`stripe.invoice`)

- [x] Lines, total, paid, due, due date, the address Stripe sends to
- [x] Send (a draft is finalized first), Mark as paid (paid outside Stripe), Void, Mark uncollectible, each with a confirm that states number, amount and customer
- [x] An invoice Stripe charges automatically is not offered "Send"
- [x] In test mode the notice says Stripe emails no customer
- [-] Credit notes, a partial external payment, editing a draft's lines: left to the Dashboard

## 8. States

- [x] Stripe not connected: "Connect Stripe for this organization to see this" with a Connect button
- [x] Not an owner or admin: "Only an owner or admin of this organization can use Stripe"
- [x] Object gone in Stripe; malformed identifiers from the agent
- [x] A failed action shows Stripe's own message on the card and leaves it open
- [x] Resolved cards read as history with the notice of what was done
- [x] An action that keeps the card open (Save draft) shows its notice on the card

## 9. Dashboard comparison

- [x] Every Dashboard flow was opened on the untouched reference customers in the sandbox (the URL under `/test/`, the Sandbox header), recorded and cancelled: refund, cancel, pause and resume, coupon, credit balance, trial, charge customer, dispute page, accept, counter, evidence form, inquiry, and the invoice status wizard and send. The reference objects were read back unchanged from the API
- [x] Our fields, defaults, validation and amount wording were corrected in the shared Stripe pieces wherever they differed; the cells are in `plans/stripe-card-matrix.md`
- [x] The live pass was run again on the final code, on a second set of test customers, and each write read back from Stripe
- [-] "Refund and block" was not run live: it adds a card and an email to the sandbox's block lists, which is an account setting. Its warning and button are covered by the story and the block test
