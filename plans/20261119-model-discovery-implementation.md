# Model discovery implementation

## Design

The host owns model availability. The metadata catalog describes models. Each picker decides which available choices to display. IDs retain their harness/provider spelling throughout; the metadata join never rewrites a launch ID.

`agents.models` is a new host query, scoped by agent config, surface, and optional workspace. It returns models plus source, availability, freshness, and optional metadata. Existing procedure shapes are unchanged. New clients fall back to bundled lists if an older host lacks the query; this feature does not require raising the minimum host version.

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

The process-local cache is isolated per host database, with keys derived from config, environment, surface, and working directory. Keys are hashes; credentials are never returned. Results live for one minute, with 64 entries and 64 in-flight requests per cache. Duplicate requests share work. At most two discovery operations run concurrently. Repeated failures preserve the last successful list but mark availability unknown; an authoritative empty list replaces prior data.

models.dev metadata refreshes in the background at most once a day after success, with a short network timeout and retry backoff. Exact provider/model matches enrich entries with tool support, modalities, reasoning, family, lifecycle status, and limits. Missing metadata does not remove runtime models. No full provider catalog is stored in renderer localStorage.

ACP has no universal model-list operation. The unprompted native session is required to obtain config options and may appear in the harness's history. Discovery sends neither a prompt nor a mode change. Native subprocesses are closed in a finally block.

## Picker and launch behavior

- Desktop workspace creation and agent switching use host discovery; mobile launch preferences and model sheets use the same query.
- Desktop model menus search labels and native IDs, filter by provider, and offer an All models toggle. The default filter excludes known non-tool, non-text-output, and deprecated entries; unknown metadata and the current selection remain visible. Mobile launch lists use the same coding filters.
- Active desktop chat choices merge metadata by exact ID without replacing session options.
- Desktop fallback lists display an unverified-availability notice and allow refresh.
- Favorites are resolved against current choices before they become selectable.
- Saved model IDs survive a catalog refresh. ACP refuses to prompt if an explicit start model could not be selected; choosing an available model clears the refusal.
- Terminal launch validation and argument construction accept fresh discovered IDs as well as bundled IDs. Discovery is refreshed for unbundled selections before launch and workspace-creation validation.
- Effort options for models outside the bundled launch catalog are left to the active runtime instead of guessing a valid effort ladder.

## Verification

- Shared model catalog and launch arguments: 98 tests passed.
- Host catalog, cache, agent launch, and harness factory: 101 tests passed.
- ACP runtime, including discovery without prompting and recovery from an unavailable model: 205 tests passed.
- Host and desktop typechecks, Biome checks on all changed TypeScript files, and git diff whitespace checks passed.
- All 18 locale catalogs include the fallback notice; the i18n extraction/strict compilation check passed.
- Live, unprompted native probes: Claude ACP returned 5 models; Codex ACP and app-server each returned 8.
- Desktop CDP: matched this worktree at `http://localhost:9045`, CDP port 9345, on `/new-workspace`; verified an authenticated session. Real mouse and keyboard input opened the picker, switched agents, searched Terra, filtered OpenCode by provider, toggled All models, selected Gemini 4 Neon (absent from the bundled list), and reopened the picker with that selection intact.
- OpenCode UI at verification time: 87 default entries; Google filter 26; All models with Google selected 37. Missing metadata can leave a specialized model visible by design.
- Screenshots and probe scripts are in ignored `artifacts/model-discovery-verification/`.

Mobile typechecking reaches shared server packages and reports `unref` on `number` timer errors in port-scanner/workspace-fs. No mobile simulator run or paid model prompt was performed. Live provider membership was verified only for the available local accounts; other harnesses use the common protocol path and explicit fallback.
