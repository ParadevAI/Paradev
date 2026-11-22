# AWS Marketplace

Paradev is sold on AWS Marketplace as a SaaS contract product (`prod-vp4a2qbrbqqd6`, seller
account `615082100823`). AWS bills the buyer. Autumn records the plan and seats with
`noBillingChanges`, so Stripe never charges an AWS organization. The app reads the plan from
Autumn as it does for every other organization.

## Flow

1. The buyer subscribes. AWS posts their browser to the fulfillment URL with the form field
   `x-amzn-marketplace-token`.
2. `POST /api/integrations/aws-marketplace/fulfillment` (apps/api) calls `ResolveCustomer`, checks
   the product code, and stores the license in `aws_marketplace_customers`. It redirects to
   `/aws-marketplace?claim=…` on the web app. A repeated token refreshes the claim; a used or
   expired token shows an error page.
3. The web page needs a session, so a new buyer signs in or signs up first. The buyer picks an
   organization they own or administer. `awsMarketplace.link` links it and grants the plan.
4. EventBridge sends AWS Marketplace events to `POST /api/integrations/aws-marketplace/events`.
   Every event re-reads `GetEntitlements`; the payload is never trusted for seats.

| AWS event (EventBridge detail-type) | SNS-era action | What we do |
| --- | --- | --- |
| `License Updated - Manufacturer` | `entitlement-updated`, `subscribe-success` | Re-read entitlements, update plan and seats |
| `Purchase Agreement Amended - Manufacturer` | `entitlement-updated` | Same |
| `Purchase Agreement Ended - Manufacturer` | `unsubscribe-pending` | Re-read entitlements (access stays until deprovisioned) |
| `License Deprovisioned - Manufacturer` | `unsubscribe-success` | Cancel the plan in Autumn |
| `Purchase Agreement Created - Manufacturer` | `subscribe-success` / `subscribe-fail` | Nothing: no license until `License Updated` |

Sellers registered after 15 July 2026 get these notifications only through EventBridge, so there
is no SNS endpoint.

## Contract dimensions

Create one contract dimension per plan, unit "users". The value is the seat count.

| Dimension API name | Autumn plan |
| --- | --- |
| `pro_seats` | `pro_v2` |
| `team_seats` | `team` |
| `ultra_seats` | `ultra` |
| `enterprise_seats` | `AWS_MARKETPLACE_ENTERPRISE_PLAN_ID` (default `enterprise`) |

When a license holds more than one dimension, the highest plan wins.

## Environment

| Variable | Notes |
| --- | --- |
| `AWS_MARKETPLACE_PRODUCT_CODE` | Product code from the listing. Unset turns both routes off (404). |
| `AWS_MARKETPLACE_REGION` | Default `us-east-1`. |
| `AWS_MARKETPLACE_ACCESS_KEY_ID`, `AWS_MARKETPLACE_SECRET_ACCESS_KEY` | IAM user in the seller account. Unset uses the SDK default chain. |
| `AWS_MARKETPLACE_SELLER_ACCOUNT_ID` | `615082100823`. Events from other accounts are ignored. |
| `AWS_MARKETPLACE_EVENTS_TOKEN` | 32+ random characters. The API destination sends it in `x-aws-marketplace-token`. Unset turns the events route off. |
| `AWS_MARKETPLACE_ENTERPRISE_PLAN_ID` | Autumn plan for `enterprise_seats`. |

IAM policy for the key:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["aws-marketplace:ResolveCustomer", "aws-marketplace:GetEntitlements"],
      "Resource": "*"
    }
  ]
}
```

## AWS setup (seller account, us-east-1)

1. Fulfillment URL in the listing: `https://<api host>/api/integrations/aws-marketplace/fulfillment`.
2. EventBridge connection, auth type API key: header `x-aws-marketplace-token`, value
   `AWS_MARKETPLACE_EVENTS_TOKEN`.
3. API destination: `POST https://<api host>/api/integrations/aws-marketplace/events`.
4. Rule on the default bus: `{"source": ["aws.agreement-marketplace"]}`, target the API destination,
   with a dead-letter queue.

## Testing with a limited listing

1. Set the variables on a preview deployment and point a limited-visibility listing's fulfillment
   URL at it. Allowlist a test buyer account.
2. Subscribe from the test account with a small contract (for example `team_seats` = 2). Check the
   redirect, sign up, link an organization, and check that Settings → Billing shows Team with 2
   seats and that Autumn has no Stripe subscription for it.
3. Open the fulfillment link again from AWS: the page says the subscription is already linked.
4. Amend the contract (more seats or another plan). The `License Updated` event changes the plan.
5. Cancel the agreement. After `License Deprovisioned` the organization is on Free.

Events are logged as `[aws-marketplace/events] <detail-type> <outcome>`.
