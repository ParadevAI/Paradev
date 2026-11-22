---
name: send-with-resend
description: Send email through Resend without surprising anyone — check the sending domain first, prove the message on Resend's test addresses, and get the user's confirmation before mail goes to a real inbox. Use when the user asks to send, schedule, or batch-send an email, test a template, or wire Resend sending into a codebase.
argument-hint: who gets the email and what it says
allowed-tools: mcp__resend__list-domains, mcp__resend__get-domain, mcp__resend__list-templates, mcp__resend__get-template, mcp__resend__send-email, mcp__resend__send-batch-emails, mcp__resend__list-emails, mcp__resend__get-email, mcp__resend__cancel-email
---

# A sent email cannot be taken back

Every other Resend call can be run again. `send-email` and `send-batch-emails`
put mail in someone's inbox, and nothing undoes that. Treat the send as the last
step of a short checklist.

## 1. Check the sending domain

The `from` address must be on a domain the account has verified for sending.
Run `list-domains` and find the domain of the `from` address:

- `verified`: send.
- `pending`, `not_started`, `failed`, or partly verified: do not send. Run
  `get-domain` and show the user the DNS records that are not verified yet.
- Not in the list: the account cannot send from it. Ask which verified domain
  to use. Do not pick one for the user.

`onboarding@resend.dev` sends without a domain, but only to the account
owner's own address. It is for a first test, not for real recipients.

## 2. Prove it on a test address first

Before a real recipient, send the same message to Resend's test addresses.
Remove `cc` and `bcc`, and put only test addresses in `to`. A real address in
any recipient field gets the test email before the user confirms in step 3.

- `delivered@resend.dev`: delivered. Add a label for each case, for example
  `delivered+welcome@resend.dev`.
- `bounced@resend.dev`: a hard bounce.
- `complained@resend.dev`: delivered, then marked as spam.
- `suppressed@resend.dev`: suppressed as an address that bounced before.

Then run `get-email` on the result. Its status is the truth: `sent` means
Resend accepted the message, `delivered` means the receiving server accepted
it.

## 3. Confirm before a real inbox

Show the user the `from`, `to`, `cc`, `bcc`, subject, and body, and wait for a
clear yes. Get this confirmation every time. Approval for an earlier send does
not cover this one.

- Set an `idempotencyKey` (for example `welcome/<user-id>`), so a retry after a
  timeout cannot send the message twice.
- To send later, set `scheduledAt`. `cancel-email` can stop a scheduled email
  until it is sent, and not after.
- One message to many people who must not see each other is a batch
  (`send-batch-emails`, at most 100 per call), or a broadcast. It is not one
  email with a long `to` list.

## 4. Sending from code

When the user wants their application to send mail, read how the codebase
already calls Resend and extend that path. The API key comes from the
environment and never goes in the repo, a client bundle, or a log line. Send
from the server only.

## Anti-patterns

- **Testing on a real person.** Use `delivered@resend.dev` until the message is
  right.
- **Reading `sent` as `delivered`.** `sent` only means that Resend accepted it.
- **Retrying a send without an idempotency key.** A timeout does not prove that
  the first send failed.
- **Changing the `from` domain so the send works.** The user picks the sender,
  not the agent.
