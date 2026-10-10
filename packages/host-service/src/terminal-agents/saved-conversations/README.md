# Saved conversation identity foundation

These pure adapters validate supplied snapshots. They do not discover files,
import records, read credentials, launch providers or authorize a resume. No
production path calls them yet. Synthetic tests exercise the supported shapes.

`validateNativeConversation` checks complete Claude or Codex JSONL against an
explicit provider, native UUID and canonical working folder. It returns a digest
and record counts without returning message content. It rejects ambiguous copies,
mixed identities, worker transcripts, missing folder evidence and malformed
records. The caller must obtain a stable, strictly UTF-8-decoded complete snapshot
and enumerate all matching paths in the selected store. A partial search is not
proof of uniqueness. Reads above 64 MiB, records above 8 MiB, and more than 100,000
records are unsupported here; no truncation is accepted.

This is structural identity evidence, not transcript replay or a guarantee that
the provider will restore every item. Unknown record types remain in the digest.
Claude sessions with changed working folders or mixed compaction-session identities
are refused pending a qualified lineage adapter. Multiple Codex rollout revisions
are refused pending authoritative revision selection. No newest-file heuristic is
used. Matching names, folders, timestamps or text never merge conversations.

`adaptT3Conversation` accepts the `t3-provider-thread-v2` object shape. It preserves
source-store, app-thread, provider-thread and native identities separately. Claude's
normal null conversation head means the provider's default saved head. An explicit
rollback cursor is retained even when T3 calls it weak; native validation must then
find it as the final assistant record. An earlier branch point fails rather than
silently resuming a later branch. Other T3 models, including legacy runtime cursor
rows, require separate adapters. This function does not certify a database version,
projection consistency, inactivity or parity with T3's rendered messages. Recorded
`idle` alone cannot establish that no process or background task is using a chat.

## Integration boundary

A future discovery/import service must validate source schema and read consistency,
canonicalize paths, bind a selected account/store, verify all writers, back up saved
history, persist a launch claim and confirm the launched native ID through provider
events. Its reference can populate the existing `HarnessSessionRef` fields
`agentId`, `sessionId`, `worktreePath` and `reportedPath`; account environment must
come from the account service, not source metadata. Never use `--continue`, `--last`,
a title or an app-thread ID as a substitute for an exact native UUID.

Original import provenance and confirmed local continuation must be stored
separately. Reopening a locally continued conversation must validate its current
local transcript. A changed or missing original archive cannot justify replaying
that archive over newer local work. An imported catalog row alone does not prove
local adoption. Those persistence, launch and UI paths are follow-up work.

## Official evidence checked October 9, 2026

- [Claude sessions](https://code.claude.com/docs/en/sessions) documents exact-ID
  resume, cross-project duplicate refusal and limits of restored background work.
  JSONL remains internal and needs versioned fixtures.
- [Anthropic's session reader, b6e9d12](https://github.com/anthropics/claude-agent-sdk-python/blob/b6e9d12fe1cc98dde988ab7b7713c1feeee50c6c/src/claude_agent_sdk/_internal/sessions.py)
  distinguishes session ownership, worker records and message-chain reconstruction.
  This module checks identity and does not duplicate that chain reconstruction.
- [Codex CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
  documents exact-ID resume and working-folder selection.
- [Codex protocol, 4bad6d7](https://github.com/openai/codex/blob/4bad6d78e9b50f9fa8bd941f1db012ed491ad2da/codex-rs/protocol/src/protocol.rs)
  defines `SessionMeta.id` as the thread identity; `session_id` can identify its root.
  Creator account metadata is historical, not the account used for this launch.
- [T3 Claude adapter, 5fe9d02](https://github.com/pingdotgg/t3code/blob/5fe9d024d9b1c28ec93d495cf1441c57e47ae7ce/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts)
  stores strong native thread references, uses a weak conversation-head reference
  for rollback and clears it after a completed turn.
- [T3 Codex adapter, the same revision](https://github.com/pingdotgg/t3code/blob/5fe9d024d9b1c28ec93d495cf1441c57e47ae7ce/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts)
  stores the native thread ID separately from app/provider thread IDs. This adapter
  deliberately does not infer the native ID from either wrapper ID.
