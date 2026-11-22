# Model discovery audit

Audited 2026-11-19. Scope: Conductor's documented model system, Paradev's current picker and launch paths, and a shared upstream catalog. No runtime behavior changed.

## Finding

Use models.dev for model metadata and each harness for runnable model discovery. Apply picker visibility as a separate policy. A global catalog cannot establish which models a particular executable, account, provider configuration, or host can run.

## Conductor evidence

Conductor documents a harness-first model system:

- [OpenCode](https://www.conductor.build/docs/reference/harnesses/opencode): asks OpenCode for models available to the user's provider configuration. Settings expose provider credentials and visible models. Model IDs are provider-qualified.
- [Codex](https://www.conductor.build/docs/reference/harnesses/codex): visible models depend on the account and Codex setup, including subscription and API access.
- [Claude Code](https://www.conductor.build/docs/reference/harnesses/claude-code): available models depend on the active account, subscription, API key, or provider.
- [Cursor](https://www.conductor.build/docs/reference/harnesses/cursor): uses Cursor API models. This differs from Paradev's terminal cursor-agent integration; its catalog cannot be copied directly.

These are documented behaviors, not verified internal implementation details. Inspection of the installed native app did not establish its discovery endpoints, cache behavior, or filter algorithm. No evidence found of a public Conductor-wide model catalog.

## Available catalog

Fetched and parsed [models.dev/api.json](https://models.dev/api.json): 324 providers and 10,035 provider-specific entries at audit time. These are not 10,035 distinct base models.

The sampled entry includes ID, name, family, reasoning options, tool-call support, input/output modalities, context/output limits, costs, and release/update dates. Provider records contain integration metadata. The [upstream repository](https://github.com/anomalyco/models.dev) is MIT licensed. The [site](https://models.dev/) also documents canonical and combined catalogs and an SDK with an offline snapshot.

Use provider-qualified keys. Do not equate provider IDs, CLI aliases, or effort-specific model IDs merely because their display names match. Metadata is useful for enrichment, not proof of runtime or account support.

## Paradev findings

1. **Static lists also gate launch validity.** `packages/shared/src/agent-models.ts` defines hand-maintained model lists, effort ladders, aliases, and launch flags. `buildAgentModelArgs` drops unknown IDs; `packages/host-service/src/trpc/router/agents/agents.ts:validateAgentModelSelection` rejects models outside the curated set. Adding dynamic options only to the UI would produce selections the launch path rejects.
2. **Active chat already has discovery plumbing.** `packages/chat-runtime/src/harness/acp/acpAdapter.ts:handleConfigOptions` normalizes runtime options into session events. The desktop `AgentComposer/ModelPicker` renders the model category from those options. Preserve this source of runtime truth.
3. **Agent switching and workspace creation differ from active chat.** `AcpChatPane.tsx` populates other agents' model lists from `getAgentModelSupport`. `NewWorkspaceScreen.tsx` and mobile launch preferences also use the static catalog. Users can therefore see different choices before and after session creation.
4. **Favorites need availability reconciliation.** Desktop `ModelPanel.tsx` builds favorite rows from saved values when the agent exists, without intersecting them with its current model options. A disappeared model can remain selectable through favorites.
5. **Hosted chat has a separate static list.** `packages/trpc/src/router/chat/chat.ts` serves `SUPERSET_CHAT_MODELS`. Discovery for this surface must reflect its actual backend routing and credentials, separately from terminal agents.

## Recommended design

Keep three separate layers:

1. **Discovery:** ask the selected host's configured harness for supported model IDs and per-model controls. For active ACP sessions, use existing config options. Candidate pre-session adapters include Codex app-server `model/list`, OpenCode's configured model listing, and Cursor CLI `--list-models`; verify their installed-version contracts before implementation. Preserve Claude aliases and custom provider IDs. Do not start paid inference to discover models.
2. **Enrichment:** join exact provider/model identities to a validated, cached models.dev snapshot. Keep valid runtime models even when the metadata catalog lacks them. Retain harness-native effort and launch semantics; a generic reasoning boolean cannot replace those.
3. **Presentation:** filter/group the discovered set by user visibility preferences, provider, capabilities, and lifecycle metadata where available. Keep favorites and recommended models prominent. Offer search across the remaining available models. Distinguish unknown availability from confirmed unavailability.

For generic provider catalogs, text output and tool-call support are useful coding-model filters. Do not apply those filters blindly when a harness explicitly advertises a model but metadata is absent. Preserve auto/default and other harness aliases as first-class choices.

Cache discovery per host, executable/version, and relevant configuration/account scope. Invalidate after auth or provider changes. Keep the last successful result and a bundled fallback for offline startup; identify fallback availability as unverified. Do not merge another host's authenticated availability into the current host.

Maintain selected and saved IDs across catalog refreshes. If unavailable, show that state and let the user choose a replacement; do not silently change the model. Hidden models should remain valid for existing sessions and explicit supported selections: visibility is not launch validation.

## Implementation order

1. Define a normalized discovery result with source, freshness, availability, native ID, optional canonical metadata, and per-model controls. Keep launch adapters and visibility policy separate.
2. Add host-side discovery for Codex and OpenCode first. Reuse ACP session options where a session exists. Verify compatibility requirements before changing tRPC contracts.
3. Update launch validation to accept discovered supported IDs, preserving safe argv construction and harness-specific effort handling.
4. Feed desktop workspace creation, agent switching, and mobile from the same discovery results. Reconcile favorites against availability.
5. Add catalog enrichment and visibility settings, then expand adapters. Handle hosted chat through its own routing-aware discovery source.

Focused regression coverage should include discovered models absent from the bundled list, stale favorites, offline fallback, host/account cache separation, preserved selected IDs, and model-specific effort validation.

## Validation and limits

Read the cited Conductor documentation, fetched the live JSON catalog, and traced the listed repository paths. No Conductor UI or authenticated model-discovery calls were exercised. No code was changed and no test suite was run. Endpoint candidates above require adapter-level verification during implementation.
