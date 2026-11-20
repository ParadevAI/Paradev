# Google OAuth verification

## Status checked on 2026-11-20

Project: `fair-scout-481221-v0` (Superset), project number `811389026306`.
The project contains the `Web (connections)` OAuth client created on 2026-10-16.

- Branding is verified; publishing is external and in production.
- The unverified OAuth user cap is exhausted: 100 / 100 users.
- Data access is not verified. The console shows preparation for verification,
  not a pending review.
- The saved draft now includes the Gmail and Calendar permissions requested by
  `packages/shared/src/connectors/connectors.json`, with updated justifications
  and the Gmail intended use `Email productivity`.
- After saving and reopening the verification summary, the only missing field
  reported by the console is the demo video. This does not mean Google has
  approved the scopes or the security assessment.

[Verification Center](https://console.cloud.google.com/auth/verification?project=fair-scout-481221-v0)
and [Audience](https://console.cloud.google.com/auth/audience?project=fair-scout-481221-v0).

## Before submission

1. Publish the privacy-policy correction in
   `apps/marketing/content/legal/privacy.mdx`. The existing text says Paradev
   does not read calendars; the Calendar plugin reads and changes events.
2. Review minimum scope needs. The draft matches the current connector, including
   overlapping Gmail permissions. Full mail access supports the plugin's
   permanent-delete endpoints. Removing that scope requires changing those tools;
   it would not remove the verification requirement for the remaining restricted
   Gmail scopes.
3. Record the actual OAuth flow and feature demonstrations below. Use a dedicated
   mailbox with synthetic messages and a test calendar. Do not send or delete
   real mail for the recording.
4. Upload the recording to YouTube with access for Google's reviewers, add its
   URL to Data Access, and review the complete submission before confirming it.
5. Complete Google's restricted-scope review and any required security assessment.
   No assessment completion or exemption was established during this check.

## Demo recording checklist

The console says the video must cover all OAuth clients assigned to this project.
Review the Web, Web Dev, Web (connections), and Android clients to determine the
app flows to show. Do not expose client secrets, tokens, or real customer data.

- Show Paradev's homepage and privacy policy, then the app's Google connection UI.
- Show the OAuth client identity, consent screen, unverified-app warning, requested
  permissions, redirect, and the connected account in Paradev.
- Explain that signing in and granting Gmail/Calendar access are separate actions.
- Gmail: search and read synthetic messages and an attachment; create a draft and
  send it to the test mailbox; change labels/read state; create and remove a label
  and a filter. Demonstrate permanent deletion only on disposable test messages.
- Automations: configure a new-mail filter and demonstrate matching synthetic mail.
- Calendar: list calendars, read an event, check availability, then create, update,
  and delete a disposable event without inviting real attendees.
- Show disconnection and explain the purpose of each requested permission.

The production project's new-user cap prevents recording a fresh grant with a
new account. Google's console recommends a staging flow or a separate test
project for recording when the cap is reached. Use an existing suitable grant
only if it can demonstrate the required flow; otherwise configure a separate
test project and identify it clearly to reviewers. Do not switch production to
testing or rotate production clients to bypass the cap.

## References

- [Restricted-scope verification and security assessment](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Gmail scopes and permanent deletion](https://developers.google.com/workspace/gmail/api/auth/scopes)

The console's lifetime unverified-user cap cannot be reset. Saving this draft
does not unblock new accounts; the requested restricted scopes need approval.
