---
name: debug-resend-delivery
description: Find out why an email sent with Resend did not arrive — find the email, read its status, then check the API log, the suppression list, the sending domain, and the webhook that should have reported it. Use when the user says an email never arrived, went to spam, bounced, or that their app's sends or webhooks are failing.
argument-hint: the recipient, subject, email id, or time of the send
allowed-tools: mcp__resend__list-emails, mcp__resend__get-email, mcp__resend__list-logs, mcp__resend__get-log, mcp__resend__get-suppression, mcp__resend__list-suppressions, mcp__resend__list-domains, mcp__resend__get-domain, mcp__resend__list-webhooks, mcp__resend__list-webhook-events, mcp__resend__get-webhook-event, mcp__resend__list-webhook-event-attempts, mcp__resend__get-email-metrics
---

# Find where the email stopped

An email that "never arrived" stopped at one of four points: Resend never
accepted the request, Resend did not send it, the receiving server rejected it,
or it arrived and the user did not see it. Find the point before you change
anything.

## 1. Find the email

Run `list-emails` and match the recipient, subject, and time. Then run
`get-email` on the match.

If there is no match, the request did not succeed. Go to step 2.

## 2. No email: read the API log

Run `list-logs` and find requests to `/emails` near the time of the send. Run
`get-log` on any request that did not return 2xx. The response body names the
cause, for example a domain that is not verified, a field that is not valid, or
a rate limit. Quote it to the user.

## 3. An email: read its status

The status in `get-email` tells you what to do next:

- `queued`, `scheduled`: not sent yet. A scheduled email waits for its time.
- `sent`: Resend accepted it, and the receiving server has not answered yet.
  Look again after a few minutes.
- `delivery_delayed`: the receiving server is deferring it. Resend tries again.
  Do not send it again.
- `delivered`, `opened`, `clicked`: it arrived. Tell the user to look in spam,
  promotions, and any mail filters, then go to step 5.
- `bounced`: the receiving server rejected it. Go to step 4.
- `complained`: the recipient marked it as spam.
- `suppressed`: Resend did not send it, because the address is on the
  suppression list. Go to step 4.
- `failed`, `canceled`: it was not sent. Read the details, and look for the
  request in step 2.

## 4. Bounces and suppressions

Run `get-suppression` with the address. The origin tells you why it is there:
`bounce` (a hard bounce), `complaint` (a spam report), or `manual`. Resend does
not send to a suppressed address again.

Remove an address only when the user asks, and only after they confirm that the
cause is fixed. If an address bounced or complained and you send to it again,
it hurts the sender reputation of the domain.

## 5. Spam placement and the domain

Run `get-domain` on the sending domain. A DNS record that is not verified
(SPF, DKIM, or the MX record for the return path) is the usual cause of mail
going to spam. Show the user each record and its status. For a pattern across
many emails and not one, run `get-email-metrics` for the period, by domain.

## 6. The webhook did not report it

When the app missed the event and not the email, run `list-webhooks`, then
`list-webhook-events` on the right webhook. An event with the status `failed`
or `attempting` has its cause in `list-webhook-event-attempts`: the HTTP status
and the body that the user's endpoint returned.

## Anti-patterns

- **Sending again to see if it works.** A bounce or a suppression gives the same
  result. A delay recovers on its own, and then the recipient gets it twice.
- **Removing a suppression to make the email go through.** The suppression is
  what protects the domain.
- **Stopping at `sent`.** It is not the end of the path. Look again.
