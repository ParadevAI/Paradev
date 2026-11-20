# Google data disclosure review

Reviewed on 2026-11-20 against this checkout. This is an implementation and
documentation audit, not counsel's opinion or Google approval. Production data,
vendor account settings, signed agreements, and deletion-job execution were not
inspected. No real mailbox contents were used in this audit.

## Findings and disclosure corrections

| Area | Evidence | Finding and correction |
| --- | --- | --- |
| Sign-in versus plugins | `packages/auth/src/server.ts`; `packages/shared/src/connectors/connectors.json`; `plugins/gmail/plugin.json`; `plugins/google-calendar/plugin.json` | Plugins use a separate Google connection from sign-in. Both plugin manifests reference the same Google connector, which requests combined Gmail/Calendar scopes. Keep those distinctions explicit. |
| Background intake | `apps/api/src/app/api/connectors/callback/[connector]/route.ts`; `apps/api/src/app/api/integrations/google/lib/reconcileWatches.ts`; `apps/api/src/app/api/integrations/google/lib/syncMailbox.ts` | Google connection callbacks enqueue a mailbox watch. Watch setup checks Gmail scopes, not whether an automation exists. Incoming message metadata is recorded before matching. Removed the implication that intake happens only after a user configures an automation or only for matching messages. |
| Mailbox content | `packages/trpc/src/router/integration/google/gmail.ts` (`MESSAGE_FIELDS`); `syncMailbox.ts` (`normalizeMessage`) | Monitoring fetches selected metadata fields and normalizes no message body. This limited claim is supported for monitoring, not all plugin use. |
| Plugin results and storage | `packages/trpc/src/router/plugins/servers/gmail/handlers/messages.ts`; `packages/chat-runtime/src/harness/claude/translateStream/translateStream.ts`; `packages/chat-runtime/src/journal/journal/journal.ts`; `packages/trpc/src/router/chat-history/chat-history.ts` | Gmail tools return message content and attachment data. Tool results become chat items; the journal stores event JSON; supported cloud history sync stores item bodies. Replaced the blanket promise that bodies and attachments are never stored. Storage location depends on the agent/workspace and sync features. |
| Credential encryption | `packages/trpc/src/router/plugins/crypto.ts`; `packages/trpc/src/lib/secret-box.ts` | Configured secret-box encryption uses AES-256-GCM; fallback/legacy values use Better Auth encryption. The installed Better Auth implementation uses XChaCha20-Poly1305. The policy now promises encryption without assigning one algorithm to every value. Production key configuration was not inspected. |
| Google disconnect | `packages/trpc/src/lib/connectors/disconnect.ts`; `packages/trpc/src/router/integration/google/release.ts`; `packages/trpc/src/router/connectors/index.ts`; `packages/trpc/src/router/plugins/plugins.ts`; `packages/trpc/src/router/integration/google/google.ts` | This PR routes connector, legacy plugin, and dedicated Google disconnect through credential deletion. Removing the last plugin using Google also removes its active personal connections. All selected Google rows are deleted and cached tools invalidated before upstream cleanup, so a concurrent refresh cannot restore the deleted row. Watch cancellation precedes revocation; both are best effort and skipped if another live connection shares the Google identity. An expired access token may prevent watch cancellation; revocation is still attempted. In-flight work and notifications can finish. |
| Retention | `apps/api/src/app/api/ingest/jobs/enforce-retention/route.ts`; `packages/db/src/schema/schema.ts` (`automationEvents`) | Intake rows have a 48-hour cleanup threshold, with bounded batches and an external schedule. Execution/backlog are unverified. Copies in runs, transcripts, files, and backups need separate review. Removed the claim that all mail metadata stays until account deletion. |
| Account deletion | `packages/trpc/src/router/user/user.ts`; `packages/trpc/src/lib/account-purge/purgeAccount.ts`; `apps/api/src/app/api/account/jobs/purge-expired-deletions/route.ts` | This PR removes personal Google connections, including inactive rows in shared organizations, when deletion is requested and again during final purge. Recovering an account requires reconnecting Google. Purge still preserves shared-organization content and does not scrub message metadata from that content. Profile de-identification is not content de-identification. |
| AI providers | `packages/host-service/src/chat-v3/agentEnv.ts`; `packages/trpc/src/lib/sandbox/credentials.ts`; `packages/shared/src/agent-credentials.ts` | Agents can use user-owned accounts and custom endpoints. A universal promise about every provider's training/retention behavior is unsupported. Distinguish Paradev's own Limited Use commitments from the user's provider relationship. |

## Open items before claiming readiness

The credential fixes above are implemented and tested in this PR, but are not
deployed. The following items remain open; policy wording does not complete them.

1. **Consent and background intake — engineering/product:** inspect the actual
   connection UI for a prominent disclosure of combined Gmail/Calendar access,
   AI-provider sharing, and automatic metadata monitoring. The callback starts
   monitoring without checking for an enabled automation. Decide whether to
   require explicit monitoring opt-in or start/stop watches with configured
   automations. Record the resulting consent flow for verification.
2. **Disconnect and deletion — engineering/privacy owner:** deploy and verify the
   credential fixes with synthetic Google accounts, including a shared grant,
   expired credentials, and account recovery. Review inactive rows left by older
   plugin disconnects: this PR removes them during account deletion and dedicated
   Google integration disconnect, but does not run a production backfill.
   Implement and test a deletion procedure for chats, transcripts, files, event
   metadata, backups, and other retained copies. Upstream cleanup is best effort;
   it does not include a durable retry queue.
3. **Retention operations — infrastructure/privacy owner:** verify the production
   cleanup schedule, successful recent runs, backlog, backup expiry, and deletion
   request handling. Code alone does not prove a time-bound production guarantee.
4. **Provider controls — privacy owner/counsel:** identify every supported agent
   credential mode, provider/endpoint, applicable terms, training opt-ins,
   feedback handling, retention, and DPA. Determine how Google's Limited Use
   restrictions remain enforceable for user-owned accounts and custom endpoints.
   Disclosing provider settings is not a substitute for compliant transfers.
5. **Security assessment — security owner:** confirm CASA scope, assessor status,
   encryption/key management, access controls, prompt-injection protections, and
   log handling. No completed assessment or exemption was verified.
6. **Counsel review and publication — counsel/privacy owner:** approve the scope
   of consent, provider relationships, retention/deletion wording, support-access
   exceptions, and account-deletion claims. Review the corrected policy together
   with the implementation gaps, then publish the reviewed version. The current
   PR is not a legal sign-off.

## Provider and Google source notes

Google requires accurate data-use notice in the consent flow as well as a privacy
policy, limits transfers and human access, and restricts general AI training.
The observed combined-scope/background-monitoring behavior therefore needs a
consent review beyond this text change. See the
[Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
and [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

[OpenAI's business-data page](https://openai.com/business-data/) describes no
training by default for business/API services. That is not evidence about a
particular user's consumer account, opt-ins, or a custom endpoint.

Anthropic's [commercial training policy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
describes a no-training default with feedback/opt-in exceptions. Its
[API retention policy](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
describes a standard 30-day period with exceptions. The
[consumer training policy](https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training)
is separate and can apply to Claude Code signed in with a consumer account.
No Paradev-specific agreement or provider setting was verified.

## Validation

- Traced the paths listed above without querying customer data or credentials.
- Ran existing Claude translation and chat journal tests: 32 passed, 0 failed.
  These verify event mapping/persistence primitives, not end-to-end Google data
  deletion or legal compliance.
- Ran Google auth/release, connector cleanup, plugin uninstall, account purge,
  and user router tests with the repository's pinned Bun 1.4.3: 33 passed,
  0 failed. Network and database operations use test doubles; no live Google
  revocation or mailbox watch was tested. The system Bun 1.3.11 could not load
  the installed Undici dependency, so it was not used for the successful run.
- `@superset/trpc` typecheck passed. Existing tRPC inputs, response shapes, and
  authorization/error contracts are unchanged; no database migration is needed.
- The full tRPC package suite passed: 1,160 tests across 135 files, 0 failures.
- Privacy prose lint and whitespace checks are recorded in the PR.
- No production publication, live deletion, OAuth completion, security
  assessment, or legal review was performed.

Use this document and `google-oauth-verification.md` as the review packet. Do not
describe the missing demo as the only readiness blocker: it is only the missing
field reported by the Cloud Console form.

Cleanup endpoints follow Google's [token revocation documentation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
and [Gmail notification stop method](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/stop).
