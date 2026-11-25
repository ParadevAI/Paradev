<div align="center">

<img width="full" alt="Claude en OpenCode werken parallel in Paradev-werkruimtes met live diffs" src="../apps/marketing/public/images/readme-hero.gif" />

### Draai 100+ coding agents parallel

<details>
<summary>🌐 Lees in andere talen</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Dit is een vertaling van de Engelse README, die leidend is.*

[![GitHub stars](https://img.shields.io/github/stars/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@paradevai-555?logo=x)](https://x.com/paradevai)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex of elke andere CLI-agent, elk in een eigen geïsoleerde worktree.<br />
Besteed je tijd aan shippen, niet aan wachten.

<br />

[**Download voor macOS**](https://github.com/paradevai/paradev/releases/latest) &nbsp;&bull;&nbsp; [Documentatie](https://docs.paradev.com) &nbsp;&bull;&nbsp; [Changelog](https://github.com/paradevai/paradev/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Codeer 10x sneller zonder omschakelkosten

Paradev draait CLI-gebaseerde coding agents parallel in geïsoleerde git-worktrees, in een terminal of als chat, met ingebouwde workflows voor terminal, review en openen-in-editor.

- **Draai meerdere agents tegelijk** zonder de overhead van contextwisselingen
- **Isoleer elke taak** in een eigen git-worktree zodat agents elkaar niet in de weg zitten
- **Houd al je agents in de gaten** vanaf één plek en krijg een melding wanneer ze aandacht nodig hebben
- **Bekijk en bewerk wijzigingen snel** met de ingebouwde diff-viewer en editor
- **Open elke werkruimte waar je die nodig hebt** met overdracht in één klik naar je editor of terminal
- **Bereik je werkruimtes overal vandaan** via remote hosts, de CLI, de SDK of MCP

Minder wachten, meer shippen.

## Functies

<table>
<tr>
<td width="50%" valign="middle">

### Parallelle werkruimtes

Draai 100+ coding agents tegelijk, elk in een eigen git-worktree met een eigen branch, terminal en omgeving. Vergelijk de resultaten en merge de winnaar.

[Docs →](https://docs.paradev.com/workspaces)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude streamt een billing-migratie terwijl andere agents in parallelle werkruimtes draaien" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Agent-monitoring

Volg elke agent vanuit de zijbalk, met werkindicatoren, voltooiingsgeluiden en dock-badges wanneer er één je aandacht nodig heeft.

[Docs →](https://docs.paradev.com/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Een agent die zijn taak afrondt terwijl de status in de zijbalk omslaat van bezig naar klaar" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Ingebouwde terminal

Tabbladen, oneindig veel splits, presets en persistente sessies die herstarts overleven. Druk op ⌘I voor een rijke prompteditor met meerregelig bewerken en @-bestandsvermeldingen.

[Docs →](https://docs.paradev.com/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Een vervolgvraag typen met een @-bestandsvermelding in de rijke prompteditor naast een gesplitste terminal" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Ingebouwde diff-viewer

Inspecteer, becommentarieer en bewerk agent-wijzigingen zonder de app te verlaten, en commit en push wanneer het klaar is.

[Docs →](https://docs.paradev.com/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="De wijzigingen van een agent reviewen in de diff-viewer" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### In-app browser & poorten

Bekijk draaiende dev-servers in een browserpaneel. Poorten worden per werkruimte gedetecteerd, dus elke worktree krijgt een eigen preview.

[Docs →](https://docs.paradev.com/browser)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="In-app browser met een preview van een dev-server met gedetecteerde poorten" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatiseringen

Draai agent-sessies volgens schema: trieer issues 's nachts, stel de wekelijkse changelog op, houd dependencies actueel.

[Docs →](https://docs.paradev.com/automations)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Geplande agent-automatiseringen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Externe toegang

Verbind een andere machine en bereik zijn werkruimtes overal vandaan: de desktop-app, de CLI of je telefoon. Wek offline hosts met een aangepast commando.

[Docs →](https://docs.paradev.com/remote-access)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hosts en leden in organisatie-instellingen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paradev CLI

Script het vanuit elke shell: maak werkruimtes aan, start agents, lees hun terminals en beheer automatiseringen met één binary. Als een agent een commando kan uitvoeren, kan hij Paradev aansturen.

[Docs →](https://docs.paradev.com/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Een werkruimte aanmaken en een agent starten vanuit de Paradev CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Commandopalet

Spring naar elke werkruimte, actie of instelling vanuit één zoekvak.

[Docs →](https://docs.paradev.com/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Typen in het commandopalet en live werkruimte-acties filteren" width="100%" /></a>
</td>
</tr>
</table>

**Ook inbegrepen:**

- **[Ingebouwde skills](https://docs.paradev.com/skills)**: agents komen voorgeladen met `superset:*`-skills (parallelle agents orkestreren, automatiseringen inplannen, feedback indienen, problemen diagnosticeren), automatisch klaargezet bij de start
- **[Modelkiezer & aangepaste agents](https://docs.paradev.com/agent-integration)**: kies bij de start een model en redeneerinspanning, en voeg elke terminal-agent toe met een eigen icoon
- **[Setup-scripts voor werkruimtes](https://docs.paradev.com/setup-teardown-scripts)**: automatiseer env-setup, dependency-installaties en dev-servers per werkruimte
- **[Terminal-presets](https://docs.paradev.com/terminal-presets)**: sla agent- en shell-layouts op en open ze met één toetsaanslag
- **[Slack & Linear](https://docs.paradev.com/use-with-linear)**: start werkruimtes vanuit Slack-berichten of Linear-issues
- **[Openen in je IDE](https://docs.paradev.com/use-with-ide)**: overdracht in één klik naar Cursor, VS Code of elke andere editor
- **[Aangepaste thema's](https://docs.paradev.com/custom-themes)**: bouw, bewerk en importeer themabestanden
- **[Sneltoetsen](https://docs.paradev.com/keyboard-shortcuts)**: elke actie is opnieuw toewijsbaar via **Instellingen → Sneltoetsen** (⌘/)
- **[Gebruik je eigen providers](https://docs.paradev.com/providers)**: verbind OpenRouter, Bedrock, Vertex of Vercel AI Gateway
- **En nog veel meer**: we shippen dagelijks, dus deze lijst loopt altijd achter. De [changelog](https://paradev.com/changelog) is de echte featurelijst.

## Ondersteunde agents

Paradev werkt met elke CLI-gebaseerde coding agent, waaronder:

| Agent | Status |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Volledig ondersteund |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Volledig ondersteund |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Volledig ondersteund |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Volledig ondersteund |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/muse-white.svg" /><img height="16" align="top" alt="Muse Code" src="../packages/ui/src/assets/icons/preset-icons/muse.svg" /></picture> &nbsp;[Muse Code](https://developer.meta.com/ai/products/muse-code/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/devin-white.svg" /><img height="16" align="top" alt="Devin" src="../packages/ui/src/assets/icons/preset-icons/devin.svg" /></picture> &nbsp;[Devin](https://devin.ai/cli) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Volledig ondersteund |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Volledig ondersteund |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Volledig ondersteund |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Volledig ondersteund |
| Elke andere CLI-agent | Werkt zonder configuratie |

Als het in een terminal draait, draait het op Paradev

Agents krijgen meer dan alleen een terminal:

- **Modelkiezer**: kies een model en redeneerinspanning wanneer je een agent start
- **Instellingen per agent**: stem startcommando's, prompt-templates en modeloverrides af in Instellingen → Agents
- **Aangepaste agents**: voeg elke terminal-agent toe met een eigen icoon en hij werkt als een ingebouwde
- **Status en meldingen**: werkindicatoren, voltooiingsgeluiden en dock-badges wanneer een agent je nodig heeft
- **Ingebouwde chat**: praat met modellen in een chatpaneel, met inline toolgoedkeuringen en planreview

<details>
<summary><strong>Veelgestelde vragen</strong></summary>
<br />

<details>
<summary>Is Paradev een terminal-app of een desktop-app?</summary>
<br />

Paradev is een desktop-app, geen terminal-app. Agents draaien erin als chat of in een terminal. Daarnaast krijg je een diff-viewer, pull requests, een in-app browser en een bestandseditor. [FAQ-docs](https://docs.paradev.com/faq)

</details>

<details>
<summary>Moet ik een terminal gebruiken, of kan ik met de coding agent chatten?</summary>
<br />

Nee, Paradev kan een agentsessie als chat tonen in plaats van als terminal, en je keurt de acties van de agent met één klik goed of af. Chat werkt met Claude Code, Codex, OpenCode en Pi; Paradev draait de CLI die je al hebt geïnstalleerd, dus je login en instellingen blijven behouden. De schakelaar **CLI** / **Chat** wisselt een lopende sessie om zonder context te verliezen, en andere agents draaien in een Paradev-terminal. [Chat-docs](https://docs.paradev.com/chat)

</details>

<details>
<summary>Wat is de licentie van Paradev, wat kost het en op welke platforms draait het?</summary>
<br />

Paradev is open source onder de MIT-licentie. Het Free-abonnement dekt lokale werkruimtes met de desktop-app en de CLI. Betaalde abonnementen voegen functies toe zoals automatiseringen en cloudwerkruimtes. De desktop-app draait op macOS, met een experimentele Linux-AppImage; Windows is nog niet beschikbaar. [Prijzen](https://paradev.com/pricing) · [FAQ-docs](https://docs.paradev.com/faq)

</details>

<details>
<summary>Is Paradev hetzelfde als Superset? Heeft het iets te maken met Apache Superset?</summary>
<br />

Paradev heette eerder Superset, en daarom is het CLI-commando nog steeds `superset`. Het heeft niets te maken met Apache Superset, de business-intelligencetool. [Installatie-docs](https://docs.paradev.com/install)

</details>

<details>
<summary>Welke coding agents ondersteunt Paradev, en houd ik mijn eigen abonnementen?</summary>
<br />

Paradev heeft ingebouwde ondersteuning voor Claude Code, Codex, OpenCode, Cursor Agent, Gemini CLI, Amp en meer, en je kunt elke andere CLI-agent toevoegen. Claude Code, Codex, OpenCode en Pi kunnen ook als chat draaien. Agents gebruiken je eigen abonnementen en API-sleutels, en Paradev stuurt modelaanroepen niet via een eigen proxy. [Docs over ondersteunde agents](https://docs.paradev.com/supported-agents)

</details>

<details>
<summary>Hoe voorkom ik dat meerdere coding agents elkaars werk overschrijven in één repository?</summary>
<br />

Paradev geeft elke agent een eigen werkruimte: een Git-worktree op een eigen branch, met een eigen terminal. Agents bewerken aparte kopieën van de werkbestanden, dus de ene agent overschrijft de wijzigingen van een andere agent niet. Worktrees sandboxen geen processen, en branches kunnen nog steeds conflicteren wanneer je ze merget. [Werkruimte-docs](https://docs.paradev.com/workspaces)

</details>

<details>
<summary>Ik heb te veel Claude Code-terminalsessies. Hoe houd ik ze bij?</summary>
<br />

Paradev toont elke agentsessie in één zijbalk, gegroepeerd per project, met een status per sessie, of die nu als chat of in een terminal draait. Claude Code meldt wanneer het klaar is en wanneer het op je input wacht, en de zijbalk markeert werkruimtes die jou nodig hebben. [Docs over agentstatus](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Kan ik twee coding agents op dezelfde taak zetten en de resultaten vergelijken?</summary>
<br />

Ja, in Paradev geef je dezelfde prompt aan twee of meer werkruimtes, elk op een eigen branch, met dezelfde agent of verschillende agents. Daarna vergelijk je de diffs en houd je het beste resultaat. [Recept: agents laten racen](https://docs.paradev.com/recipes/race-agents)

</details>

<details>
<summary>Kan ik Claude Code en Codex samen gebruiken, waarbij de een code schrijft en de ander die reviewt?</summary>
<br />

Ja, Paradev draait Claude Code en Codex naast elkaar, elk als chat of in een terminal. Voor een review selecteer je regels in het tabblad **Code** van een pull request en stuur je ze naar de andere agent, of gebruik je **Continue with another agent** om een sessie van een andere agent te starten met de recente context. [Docs over agentsessies](https://docs.paradev.com/agent-sessions)

</details>

<details>
<summary>Hoe review ik de diff van een coding agent en stuur ik vervolgopdrachten voordat ik merge?</summary>
<br />

Paradev toont de wijzigingen van elke werkruimte in een diff-viewer, waar je commit, pusht en een pull request opent. Selecteer in het tabblad **Code** van de pull request regels en stuur een opmerking naar een lopende agent of een nieuwe sessie; die op GitHub plaatsen is optioneel. Je kunt de checks volgen en mergen vanuit hetzelfde scherm. [Pull request-docs](https://docs.paradev.com/pull-requests)

</details>

<details>
<summary>Hoe houd ik de dev-server, poorten en preview van elke branch gescheiden?</summary>
<br />

Paradev houdt elke branch in een eigen worktree en toont de poorten waarop de processen van elke werkruimte luisteren, gegroepeerd per werkruimte. Selecteer een poort om de dev-server van die branch te openen in de in-app browser. Paradev wijst geen poortbereiken toe, dus stel configuratie per werkruimte in met een setupscript, dat in elke nieuwe werkruimte draait met variabelen zoals `SUPERSET_WORKSPACE_PATH`. [Poorten-docs](https://docs.paradev.com/ports)

</details>

<details>
<summary>Kan ik op een element in mijn draaiende web-app klikken en een coding agent het laten aanpassen?</summary>
<br />

Ja, Paradev heeft een Design-modus in de in-app browser: open je dev-server, zet **Design** aan en klik op het element. Daarna beschrijf je de wijziging, en de agent krijgt de details van het element en een screenshot met je notitie. [Browser-docs](https://docs.paradev.com/browser)

</details>

<details>
<summary>Kan ik een melding krijgen wanneer een coding agent mijn input nodig heeft?</summary>
<br />

Ja, de Paradev-desktop-app geeft een melding wanneer een agent klaar is of stopt om op je input te wachten, en het dock-icoon van macOS toont een badge. De ondersteuning verschilt per agent: Claude Code meldt beide toestanden, en sommige agents melden alleen wanneer ze klaar zijn. In de mobiele app laat een stip op de werkruimte zien dat een agent je toestemming nodig heeft; pushmeldingen zijn nog niet beschikbaar. [Docs over agentstatus](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Kan ik mijn coding agents volgen en ze antwoorden vanaf mijn iPhone?</summary>
<br />

Ja, met Paradev voor iPhone en iPad start je agents, volg je hun sessies live, beantwoord je ze en review je hun wijzigingen. Je hebt iOS 26 of iPadOS 26 of nieuwer en Paradev Pro nodig, en er is ook een Android-app in Google Play. Voor werkruimtes op je computer zet je Externe toegang aan en houd je de computer wakker en online. [Docs over de mobiele app](https://docs.paradev.com/mobile)

</details>

<details>
<summary>Kan een coding agent volgens een schema draaien, zoals nachtelijk onderhoud of een wekelijkse controle op flaky tests?</summary>
<br />

Ja, Paradev-automatiseringen draaien een agent volgens een schema per uur, per dag, per week of op maat. Elke run maakt een werkruimte aan waarin je de wijzigingen reviewt en het werk voortzet. Automatiseringen vereisen het Pro-abonnement. [Automatiserings-docs](https://docs.paradev.com/automations)

</details>

<details>
<summary>Kan ik een coding agent starten vanuit Slack, Linear, Sentry of een GitHub-pull request?</summary>
<br />

Ja, Paradev-automatiseringen starten een agent wanneer er een GitHub-pull request-event, een Slack-bericht, een Linear-issue, een Sentry-issue of een webhook binnenkomt, en de agent krijgt de details van het event samen met je prompt. Je kunt ook de Paradev-bot in Slack noemen om een cloudwerkruimte en een agent te starten. Automatiseringen en de Slack-integratie vereisen het Pro-abonnement. [Automatiserings-docs](https://docs.paradev.com/automations)

</details>

<details>
<summary>Kan ik coding agents starten vanaf de command line of vanuit een andere agent?</summary>
<br />

Ja, de Paradev-CLI maakt werkruimtes aan en start daarin agents vanuit een shellscript of vanuit een andere agent. Agents kunnen ook de Paradev-MCP-server gebruiken om met werkruimtes en terminals te werken. De desktop-app bevat een orchestrate-skill waarmee één agent workers in aparte werkruimtes coördineert. [CLI-docs](https://docs.paradev.com/cli/getting-started)

</details>

<details>
<summary>Kan ik coding agents op een externe machine of in de cloud draaien en de wijzigingen vanaf mijn laptop reviewen?</summary>
<br />

Ja, met externe toegang van Paradev (Pro-abonnement) open je vanaf je laptop werkruimtes die op een andere machine draaien, zoals een Mac mini of een server. Cloudwerkruimtes (Team- en Ultra-abonnement) draaien elke werkruimte op een eigen cloudmachine, zodat agents doorwerken wanneer je laptop dicht is. [Docs over externe toegang](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Kan ik later terugkomen bij een taak met de agentsessie en branch nog intact?</summary>
<br />

Ja, een Paradev-werkruimte blijft op schijf staan als Git-worktree op zijn branch totdat je hem verwijdert. Terminals horen bij een achtergrondproces, dus ze blijven draaien en houden hun scrollback wanneer je de app sluit of bijwerkt. Als een terminal stopt na een crash of herstart, kan Paradev de agentsessie hervatten voor agents die hervatten ondersteunen, zoals Claude Code en Codex. [Docs: agents laten doordraaien](https://docs.paradev.com/keep-agents-running)

</details>

<details>
<summary>Kan een klein team één machine delen voor coding agents?</summary>
<br />

Ja, een Paradev-host kan een gedeelde machine zijn, zoals een Mac mini, die teamgenoten bereiken via externe toegang (Pro-abonnement). Wanneer de host voor het eerst online komt, heeft alleen de persoon die hem heeft gestart toegang. Die persoon voegt teamgenoten toe onder **Settings → Hosts**. [Docs over externe toegang](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Waarin verschilt Paradev van Conductor, Orca en Cursor?</summary>
<br />

Paradev, Conductor en Orca draaien allemaal coding agents in parallelle Git-worktrees, en Cursor is een AI-editor die rond een eigen agent is gebouwd. Paradev draait elke CLI-agent op je eigen abonnementen en opent een werkruimte in Cursor wanneer je daar wilt bewerken. Orca is ook open source en draait op Windows, dat Paradev nog niet ondersteunt. Conductor sluit zich aan bij Meta en is gesloten voor nieuwe gebruikers, en Paradev heeft een handleiding om Conductor-werkruimtes over te zetten. [Overstappen van Conductor](https://docs.paradev.com/migrate-from-conductor)

</details>

<details>
<summary>Is Paradev een vervanging voor tmux?</summary>
<br />

Ja, voor het draaien van coding agents kan Paradev tmux vervangen: de terminalsessies blijven draaien wanneer je de app sluit, afsluit of bijwerkt. Elke werkruimte krijgt ook een eigen worktree en status in de zijbalk. Je kunt nog steeds tmux draaien in een Paradev-terminal. [Docs: agents laten doordraaien](https://docs.paradev.com/keep-agents-running)

</details>

</details>

## Meer dan een desktop-app

Elk oppervlak praat met dezelfde werkruimtes, dus je kunt een taak in de app starten en er overal op terugkomen.

| Oppervlak | Wat je krijgt |
|:--------|:-------------|
| [**Desktop-app**](https://github.com/paradevai/paradev/releases/latest) | De volledige IDE: terminals, diff-viewer, in-app browser, automatiseringen |
| [**CLI**](https://docs.paradev.com/cli/getting-started) | Eén `superset`-binary om werkruimtes, agents, terminals en hosts vanuit elke shell te beheren |
| [**TypeScript SDK**](https://docs.paradev.com/sdk/getting-started) | Stuur Paradev programmatisch aan met [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) vanuit Node, Bun of Deno |
| [**MCP-server**](https://docs.paradev.com/mcp) | Laat Claude Code, Codex, Cursor en andere agents zelf werkruimtes aanmaken en beheren |

De CLI wordt meegeleverd met de desktop-app, of installeer hem los:

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
# or
brew install paradevai/tap/superset
```

Er komt binnenkort een iOS-app zodat je je agents vanaf je telefoon kunt checken.

## Installatie

Download de desktop-app:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/paradevai/paradev/releases/latest/download/Paradev-x86_64.AppImage) (experimenteel; macOS is het primaire doelplatform)
- **Windows**: nog niet beschikbaar
- [Alle builds](https://github.com/paradevai/paradev/releases/latest)

Het enige dat je geïnstalleerd moet hebben is [Git](https://git-scm.com/). [gh](https://cli.github.com/) is optioneel en ontgrendelt de PR-workflows; Paradev biedt aan het voor je te installeren.

## Ontwikkeling

Wil je aan Paradev sleutelen of een PR bijdragen? Cloneer de repository, voeg hem toe aan de
geïnstalleerde Paradev-app en maak een werkruimte aan voor je wijziging:

```bash
git clone https://github.com/paradevai/paradev.git
```

Draai daarna de development-setup vanuit de terminal van die werkruimte:

```bash
./.paradev/setup.local.sh
bun run dev
```

Draai `setup.local.sh` één keer in elke nieuwe worktree. Het configureert werkruimte-specifieke
app-identiteit en poorten, zodat de development-desktop-app naast de geïnstalleerde
Paradev-app en andere development-worktrees kan draaien.

Er is geen Neon-account en er zijn geen third-party credentials nodig. `setup.local.sh` zet
een lokale Postgres + Electric-stack op via Docker en seedt een dev-account. Log in
met de knop **"Sign in as dev"** (of `admin@local.test` / `supersetdev`).

Vereisten: [Bun](https://bun.sh/) v1.4.3+ (vastgezet in `.bun-version`), `docker`, `jq` en `caddy`, dat `bun dev` draait als de lokale HTTPS-proxy (`brew install jq caddy && caddy trust`).

Zie [**DEVELOPMENT.md**](../DEVELOPMENT.md) voor de volledige gids: wat het setup-script doet, handmatige setup tegen echte services, veelgebruikte commando's, troubleshooting en hoe je de desktop-app bouwt. Het bijdrageproces staat in [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Configuratie

Configureer setup-, teardown- en run-scripts voor werkruimtes in `.paradev/config.json`. Zie de [volledige documentatie](https://docs.paradev.com/setup-teardown-scripts).

```json
{
  "setup": ["./.paradev/setup.sh"],
  "teardown": ["./.paradev/teardown.sh"],
  "run": ["./.paradev/run.sh"]
}
```

Sneltoetsen zijn aanpasbaar via **Instellingen → Sneltoetsen** (⌘/); zie de [volledige sneltoetsenlijst](https://docs.paradev.com/keyboard-shortcuts).

## Tech-stack

<p>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white" alt="Electron" /></a>
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB" alt="React" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white" alt="TailwindCSS" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://turbo.build/"><img src="https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white" alt="Turborepo" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-%23646CFF.svg?logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://biomejs.dev/"><img src="https://img.shields.io/badge/Biome-339AF0?logo=biome&logoColor=white" alt="Biome" /></a>
  <a href="https://orm.drizzle.team/"><img src="https://img.shields.io/badge/Drizzle%20ORM-FFE873?logo=drizzle&logoColor=black" alt="Drizzle ORM" /></a>
  <a href="https://neon.tech/"><img src="https://img.shields.io/badge/Neon-00E9CA?logo=neon&logoColor=white" alt="Neon" /></a>
  <a href="https://trpc.io/"><img src="https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white" alt="tRPC" /></a>
</p>

## Standaard privé

- **Expliciete verbindingen**: jij kiest welke agents, providers en integraties je verbindt.

## Bijdragen

We verwelkomen bijdragen! Zie [CONTRIBUTING.md](../CONTRIBUTING.md) voor hoe je aan de slag gaat en een PR opent. Bugs en featureverzoeken horen in [issues](https://github.com/paradevai/paradev/issues).

<a href="https://github.com/paradevai/paradev/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paradevai/paradev" />
</a>

## Community

Word lid van de Paradev-community om hulp te krijgen, feedback te delen en andere gebruikers te ontmoeten:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chat met het team en de community
- **[Twitter](https://x.com/paradevai)**: volg voor updates en aankondigingen
- **[GitHub Issues](https://github.com/paradevai/paradev/issues)**: meld bugs en vraag features aan
- **[GitHub Discussions](https://github.com/paradevai/paradev/discussions)**: stel vragen en deel ideeën

### Team

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licentie & wat voor altijd gratis is

**De desktop-app is voor altijd gratis.** Agents parallel draaien op je eigen machine zal nooit betaling vereisen. Alles waarvoor we geld vragen, wordt een optionele service daarbovenop.

De hele app staat in deze repo onder de [MIT-licentie](../LICENSE.md): gebruik hem, fork hem, pas hem aan, self-host hem en verspreid hem verder.
