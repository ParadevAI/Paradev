---
name: send-for-signature
description: Prepare a Docusign envelope for a document (a board consent, offer letter, option agreement, NDA, contract) with the right signers and signature and date fields, and leave it as a draft for the user to review before it goes out. Use when the user says "send this for signature", "set up the Docusign", "get the board to sign", "DocuSign this to X", or asks where an envelope stands.
argument-hint: the document to send and who signs it
---

# Send for signature

Sending an envelope emails every signer and cannot be taken back. Build it as a
draft, show the user what will go out, and send only when they say so.

## 1. Pin down the document and the signers

- Use the exact file the user means. If it came from email, take the latest
  version in the thread: lawyers often re-send "corrected" drafts minutes
  later, and the earlier one is wrong.
- Read the signature page. The signers are the names printed there. If the
  document is a written consent, every person on the page must sign.
- Get each signer's email from the user or from recent mail. When one person
  has several addresses, ask which one they sign from rather than guessing.

## 2. Build the draft

List the tools first (`superset mcp tools --plugin docusign`) and use the
schemas they return. Names and arguments come from Docusign and change.

- Create the envelope with status `created` (draft), never `sent`.
- Add one recipient per signer. Use parallel routing (the same routing order
  for all) unless the user asks for an order.
- For each signer, place a signature field on their signature line and a
  date-signed field on their "Dated" line. Prefer anchor text (the signer's
  printed name, or "Dated:") over fixed coordinates, so the fields land in the
  right place if the page reflows.
- Subject: the document's title and the company, e.g.
  "Acme Inc. – Board Consent: Option Grant (J. Doe)".

## 3. Hand it back

Report the envelope id, the signers and their emails, the fields per signer,
and a link to the draft. Ask whether to send it. Send only on a clear yes.

## 4. Track it

When asked where it stands, list the envelope's recipients and their status,
and name who still has to sign. For a written consent, the action is effective
on the date the last signer signs: say that date once everyone has signed.

## Anti-patterns

- Sending without the user's go-ahead because the draft "looked right".
- Using an attachment from an older message in the thread.
- Placing fields by page coordinates when the signer's name is on the page.
- Adding people as signers who are only meant to receive a copy: use a
  carbon-copy recipient for them.
