# Translation glossary

Input for translators, reviewers, and the translation CI prompt. Policy
(Kiet, 2026-08-27): **product vocabulary translates — except the words
"Paradev" and the former name "Superset", which are never translated or
transliterated in any locale.** "Workspace", "agent", "pane", "task", "automation", and the rest
are rendered in each locale's natural term, not kept as English islands.

## Never translated

These are literal identifiers, not vocabulary:

- **Paradev** (brand), **Superset** (former name), product names of
  third-party agents and tools (Claude, Claude Code, Codex, Gemini, Cursor, GitHub, Linear, Slack, ...)
- CLI commands and flags (`superset ws create`, `--json`), file paths,
  environment variables, code identifiers
- Keyboard keys and chords (⌘K, Ctrl+Shift+P)
- Protocol/standard names (MCP, tRPC, SSH, PR in `git`-context UI strings is
  translated per locale convention; see per-term notes below)

## Per-term guidance

| Term | Guidance |
|---|---|
| workspace | Translate with the locale's standard software term (e.g. ja: ワークスペース, zh-CN: 工作区). Must be used consistently everywhere, including onboarding and docs. |
| agent | Translate/transliterate per locale convention for AI agents (ja: エージェント, zh-CN: 智能体 or 代理 — pick one per locale and keep it). |
| pane | The locale's standard split-view/pane term. |
| pull request / PR | Follow the locale's developer convention (ja and zh commonly keep "PR"/"プルリクエスト"). |
| terminal | The locale's standard term for a terminal emulator. |
| host / host service | Translate "host" only where it reads as a common noun; "host-service" as a component name stays English. |
| paywall | Use the locale's established term for a subscription gate: the loanword where that is what the market says (ja: ペイウォール, ko: 페이월, fr/de/it/nl/pl/cs/pt-BR/id/vi: paywall), a native rendering where one is standard (zh-CN: 付费墙, zh-TW: 付費牆, es: muro de pago, tr: ödeme duvarı, ru: пейволл, uk: пейвол). |
| seed round, Series A, other funding terms | Use the form the locale's tech press and founders use, which is often the English term, never a dictionary rendering (uk: seed-раунд, not посівний раунд). Money in the uk catalog is written $11,5 млн. |
| developer vocabulary (uk) | The uk catalog uses the words Ukrainian developers say: кодинг-агент, тред, логи, ребейз, ендпоінт, реліз, релей, баг, тікет, дашборд, dev-сервер; branch a chat is створити гілку, fork is форкнути. Plain UI chrome stays standard product Ukrainian (Налаштування, Скасувати, Застосунок, Обліковий запис). |
| verb forms (uk) | One form per kind of text, so labels that sit together match: buttons and menu items use the infinitive (Зберегти, Вибрати все); help text, empty-picker placeholders and getting-started steps use «ви» (Виберіть проєкт, Налаштуйте автоматизацію); prompts the user sends to an agent use «ти» (Знайди й виправ дрібний баг). |

Add a row whenever a translation review settles a disputed term; this file
rides along in the LLM translation prompt, so rows here are enforcement, not
documentation.
