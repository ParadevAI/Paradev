# Model discovery implementation

## Design

The host owns model availability. The metadata catalog describes models. Each picker decides which available choices to display. IDs retain their harness/provider spelling throughout; the metadata join never rewrites a launch ID.

`agents.models` is a new host query, scoped by agent config, surface, and optional workspace, project, or active session. It returns models plus source, availability, freshness, and optional metadata. Existing procedure shapes are unchanged. New clients fall back to bundled lists if an older host lacks the query; this feature does not require raising the minimum host version.

Discovery coverage:

| Surface | Source |
| --- | --- |
| ACP chat | The same harness factory and account environment as chat. Initialize and open an unprompted native session, read model config options, then dispose the process. Supports the configured Claude, Codex, OpenCode, Pi, and Paradev chat harnesses, and custom configs resolved to supported chat agents. |
| Codex terminal | Paginated app-server `model/list`, excluding hidden entries. |
| OpenCode terminal | The configured executable's ACP model options, so terminal choices use the same provider configuration as chat. |
| Cursor terminal | The configured CLI's `--list-models` output. |
| Other agents, unsupported discovery, offline hosts | Bundled catalog, explicitly marked as unverified. |
| Existing chat session | Its own runtime config options stay authoritative. |

The older cloud `chat.getModels` endpoint is unchanged: its routes and credentials are a separate backend, so the host catalog cannot establish its availability.

## Cache and metadata

The process-local cache is isolated per host database, with keys derived from config, environment, surface, and working directory. Keys are hashes; credentials are never returned. Results live for one minute, with 64 entries and 64 in-flight requests per cache. Duplicate requests share work. A process-wide scheduler admits two operations and at most 32 waiting requests. A 20-second deadline covers queueing, environment resolution and protocol calls; expired queued work never starts, and active probes dispose their processes. Repeated failures preserve the last successful list but mark availability unknown; an authoritative empty list replaces prior data.

models.dev metadata refreshes in the background at most once a day after success, with a short network timeout and retry backoff. Exact provider/model matches enrich entries with tool support, modalities, reasoning, family, lifecycle status, and limits. Missing metadata does not remove runtime models. No full provider catalog is stored in renderer localStorage.

ACP has no universal model-list operation. The unprompted native session is required to obtain config options and may appear in the harness's history. Discovery sends neither a prompt nor a mode change. Native subprocesses are closed in a finally block.

## Picker and launch behavior

- Desktop workspace creation and agent switching load discovery when an agent tab is opened. Mobile model sheets load the selected agent; the composer only reads cached choices. Both carry project context when available.
- Desktop model menus search labels and native IDs, filter by provider, and offer an All models toggle. The default filter excludes known non-tool, non-text-output, and deprecated entries; unknown metadata and the current selection remain visible. Mobile launch lists use the same coding filters.
- Active desktop chat reads the existing live session through the runtime registry, checking workspace scope and rejecting dead sessions. It enriches exact IDs without opening a discovery process or replacing session options.
- Desktop fallback lists display an unverified-availability notice and allow refresh.
- Favorites are resolved against current choices before they become selectable.
- Saved model IDs survive a catalog refresh. ACP refuses to prompt if an explicit start model could not be selected; choosing an available model clears the refusal.
- Terminal launch preparation discovers unbundled selections in the actual workspace and passes the result directly into validation and argument construction. Neither reads a shared cache. Creation preflight checks the agent and launch controls but defers model availability until the workspace exists.
- Effort options for models outside the bundled launch catalog are left to the active runtime instead of guessing a valid effort ladder.

## Verification

- Shared model catalog and launch arguments: 98 tests passed.
- Host catalog, scheduler, session scoping, agent launch, CLI resolution, environment and harness factory: 112 tests passed.
- ACP runtime, including discovery without prompting and recovery from an unavailable model: 205 tests passed.
- Host and desktop typechecks, Biome checks on all changed TypeScript files, and git diff whitespace checks passed.
- All 18 locale catalogs include the fallback notice; the i18n extraction/strict compilation check passed.
- Live, unprompted native probes: Claude ACP returned 5 models; Codex ACP and app-server each returned 8.
- Desktop CDP: matched this worktree at `http://localhost:9045`, CDP port 9345, on `/new-workspace`; verified an authenticated session. Real mouse and keyboard input opened the picker, switched agents, searched Terra, filtered OpenCode by provider, toggled All models, selected Gemini 4 Neon (absent from the bundled list), and reopened the picker with that selection intact.
- OpenCode UI at verification time: 87 default entries; Google filter 26; All models with Google selected 37. Missing metadata can leave a specialized model visible by design.
- Screenshots and probe scripts are in ignored `artifacts/model-discovery-verification/`.

Mobile typechecking reaches shared server packages and reports `unref` on `number` timer errors in port-scanner/workspace-fs. No mobile simulator run or paid model prompt was performed. Live provider membership was verified only for the available local accounts; other harnesses use the common protocol path and explicit fallback.

## Runtime ownership and deployment boundaries

`resolveAcpLaunch` is shared by chat startup and discovery. It resolves the same CLI, adapter, version and account environment, including sandbox-managed environment hydration. The resolved launch is passed directly to the discovery harness and is also used for its cache identity. Preset resolution lives with agent configuration rather than importing the agent router.

A cached list is advisory: it does not authorize a launch. File-based logins and provider configuration can change independently of environment variables, so explicit refresh and fresh launch-time discovery remain necessary. Structured `unsupported`, `timeout`, `busy`, and `failed` states distinguish discovery failure classes; diagnostics log the agent and reason without credentials or subprocess output.

Local and remote machines execute the same host-owned path. A running cloud sandbox uses that path after its managed environment is ready; sandbox bootstrap routes terminal launches through `runAgentInWorkspace`. Before provisioning, no runtime exists: cloud creation offers unverified bundled choices and validates at actual startup. The older hosted-chat backend remains separate. No remote relay or cloud sleep/wake end-to-end run has been performed.

After refactoring, desktop CDP captured exactly one model-query POST on opening the Codex tab, followed by its eight native models. Reopening an already-fresh OpenCode tab issued no additional model query. This verifies demand-driven client behavior locally, not cloud lifecycle behavior.

## Agent eligibility

Workspace model discovery and picker tabs use the active surface’s capabilities: the existing ACP harness registry for chat and shared model-selection support for terminals. Mastracode has neither capability and is excluded. Existing terminal agent configuration is unchanged. Verified the local desktop picker has Favorites, Claude, OpenCode, Pi, and Codex tabs and loads eight Codex runtime options. Desktop type checking and Biome passed.

## Default model wording

Desktop and mobile pre-launch controls say “Agent default” when no model override is selected. This leaves selection to the agent. Active desktop chat already renders the label matching the ACP session’s current model value. Verified the pre-launch label in the local desktop; launch-option tests (4), the existing selected-model ACP test (1), Biome, and all 18 locale checks passed.
