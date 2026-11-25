<div align="center">

<img width="full" alt="Claude und OpenCode arbeiten parallel in Paradev-Arbeitsbereichen mit Live-Diffs" src="../apps/marketing/public/images/readme-hero.gif" />

### Führe über 100 Coding-Agenten parallel aus

<details>
<summary>🌐 In anderen Sprachen lesen</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Dies ist eine Übersetzung des [englischen READMEs](../README.md), das die maßgebliche Version ist.*

[![GitHub stars](https://img.shields.io/github/stars/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@paradevai-555?logo=x)](https://x.com/paradevai)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex oder jeder andere CLI-Agent, jeder in seinem eigenen isolierten Worktree.<br />
Verbring deine Zeit mit Shippen, nicht mit Warten.

<br />

[**Für macOS herunterladen**](https://github.com/paradevai/paradev/releases/latest) &nbsp;&bull;&nbsp; [Dokumentation](https://docs.paradev.com) &nbsp;&bull;&nbsp; [Changelog](https://github.com/paradevai/paradev/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Programmiere 10x schneller, ohne Kosten fürs Kontextwechseln

Paradev führt CLI-basierte Coding-Agenten parallel in isolierten Git-Worktrees aus, im Terminal oder als Chat, mit integriertem Terminal, Review und Öffnen-im-Editor-Workflows.

- **Führe mehrere Agenten gleichzeitig aus**, ohne den Overhead ständiger Kontextwechsel
- **Isoliere jede Aufgabe** in ihrem eigenen Git-Worktree, damit sich die Agenten nicht gegenseitig in die Quere kommen
- **Behalte alle deine Agenten im Blick** von einem Ort aus und werde benachrichtigt, wenn sie Aufmerksamkeit brauchen
- **Prüfe und bearbeite Änderungen schnell** mit dem integrierten Diff-Viewer und Editor
- **Öffne jeden Arbeitsbereich dort, wo du ihn brauchst**, mit Ein-Klick-Übergabe an deinen Editor oder dein Terminal
- **Erreiche deine Arbeitsbereiche von überall** über Remote-Hosts, die CLI, das SDK oder MCP

Weniger warten, mehr shippen.

## Funktionen

<table>
<tr>
<td width="50%" valign="middle">

### Parallele Arbeitsbereiche

Führe über 100 Coding-Agenten gleichzeitig aus, jeden in seinem eigenen Git-Worktree mit eigener Branch, eigenem Terminal und eigener Umgebung. Vergleiche die Ergebnisse und merge den Gewinner.

[Docs →](https://docs.paradev.com/workspaces)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude streamt eine Billing-Migration, während andere Agenten in parallelen Arbeitsbereichen laufen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Agenten-Überwachung

Verfolge jeden Agenten über die Seitenleiste, mit Aktivitätsanzeigen, Abschluss-Klängen und Dock-Badges, wenn einer deine Aufmerksamkeit braucht.

[Docs →](https://docs.paradev.com/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Ein Agent schließt seine Aufgabe ab und der Status in der Seitenleiste springt von „arbeitet“ auf „fertig“" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Integriertes Terminal

Tabs, unbegrenzte Splits, Presets und persistente Sessions, die Neustarts überleben. Drücke ⌘I für einen komfortablen Prompt-Editor mit mehrzeiliger Bearbeitung und @-Datei-Erwähnungen.

[Docs →](https://docs.paradev.com/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Eine Rückfrage mit einer @-Datei-Erwähnung im Prompt-Editor neben einem geteilten Terminal tippen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Integrierter Diff-Viewer

Prüfe, kommentiere und bearbeite Agenten-Änderungen, ohne die App zu verlassen, und mache dann Commit und Push, wenn alles fertig ist.

[Docs →](https://docs.paradev.com/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Die Änderungen eines Agenten im Diff-Viewer prüfen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### In-App-Browser & Ports

Sieh dir laufende Dev-Server in einem Browser-Panel an. Ports werden pro Arbeitsbereich erkannt, sodass jeder Worktree seine eigene Vorschau bekommt.

[Docs →](https://docs.paradev.com/browser)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="In-App-Browser mit Vorschau eines Dev-Servers und erkannten Ports" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatisierungen

Führe Agenten-Sessions nach Zeitplan aus: Issues über Nacht triagieren, den wöchentlichen Changelog entwerfen, Abhängigkeiten aktuell halten.

[Docs →](https://docs.paradev.com/automations)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Geplante Agenten-Automatisierungen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Fernzugriff

Verbinde einen weiteren Rechner und erreiche seine Arbeitsbereiche von überall: über die Desktop-App, die CLI oder dein Smartphone. Wecke Offline-Hosts mit einem eigenen Befehl auf.

[Docs →](https://docs.paradev.com/remote-access)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hosts und Mitglieder in den Organisationseinstellungen" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paradev-CLI

Skripte es aus jeder Shell: Arbeitsbereiche erstellen, Agenten starten, ihre Terminals lesen und Automatisierungen verwalten, alles mit einem einzigen Binary. Wenn ein Agent einen Befehl ausführen kann, kann er Paradev steuern.

[Docs →](https://docs.paradev.com/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Einen Arbeitsbereich erstellen und einen Agenten über die Paradev-CLI starten" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Befehlspalette

Spring von einem einzigen Suchfeld aus zu jedem Arbeitsbereich, jeder Aktion oder Einstellung.

[Docs →](https://docs.paradev.com/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="In der Befehlspalette tippen und Arbeitsbereich-Aktionen live filtern" width="100%" /></a>
</td>
</tr>
</table>

**Außerdem mit dabei:**

- **[Integrierte Skills](https://docs.paradev.com/skills)**: Agenten kommen mit vorinstallierten `superset:*`-Skills (parallele Agenten orchestrieren, Automatisierungen planen, Feedback einreichen, Probleme diagnostizieren), die beim Start automatisch bereitgestellt werden
- **[Modellauswahl & eigene Agenten](https://docs.paradev.com/agent-integration)**: wähle beim Start ein Modell und den Reasoning-Aufwand und füge jeden Terminal-Agenten mit eigenem Icon hinzu
- **[Setup-Skripte für Arbeitsbereiche](https://docs.paradev.com/setup-teardown-scripts)**: automatisiere Umgebungs-Setup, Abhängigkeitsinstallation und Dev-Server pro Arbeitsbereich
- **[Terminal-Presets](https://docs.paradev.com/terminal-presets)**: speichere Agenten- und Shell-Layouts und öffne sie mit einem Tastendruck
- **[Slack & Linear](https://docs.paradev.com/use-with-linear)**: erstelle Arbeitsbereiche aus Slack-Nachrichten oder Linear-Issues
- **[In deiner IDE öffnen](https://docs.paradev.com/use-with-ide)**: Ein-Klick-Übergabe an Cursor, VS Code oder jeden anderen Editor
- **[Eigene Themes](https://docs.paradev.com/custom-themes)**: erstelle, bearbeite und importiere Theme-Dateien
- **[Tastenkürzel](https://docs.paradev.com/keyboard-shortcuts)**: jede Aktion lässt sich unter **Einstellungen → Tastenkürzel** (⌘/) neu belegen
- **[Bring deine eigenen Provider mit](https://docs.paradev.com/providers)**: verbinde OpenRouter, Bedrock, Vertex oder Vercel AI Gateway
- **Und vieles mehr**: wir shippen täglich, diese Liste hinkt also immer hinterher. Der [Changelog](https://paradev.com/changelog) ist die echte Funktionsliste.

## Unterstützte Agenten

Paradev funktioniert mit jedem CLI-basierten Coding-Agenten, unter anderem:

| Agent | Status |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Vollständig unterstützt |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/muse-white.svg" /><img height="16" align="top" alt="Muse Code" src="../packages/ui/src/assets/icons/preset-icons/muse.svg" /></picture> &nbsp;[Muse Code](https://developer.meta.com/ai/products/muse-code/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/devin-white.svg" /><img height="16" align="top" alt="Devin" src="../packages/ui/src/assets/icons/preset-icons/devin.svg" /></picture> &nbsp;[Devin](https://devin.ai/cli) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Vollständig unterstützt |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Vollständig unterstützt |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Vollständig unterstützt |
| Jeder andere CLI-Agent | Funktioniert ohne Konfiguration |

Wenn es im Terminal läuft, läuft es auf Paradev

Agenten bekommen mehr als nur ein Terminal:

- **Modellauswahl**: wähle beim Start eines Agenten ein Modell und den Reasoning-Aufwand
- **Einstellungen pro Agent**: passe Startbefehle, Prompt-Vorlagen und Modell-Overrides unter Einstellungen → Agenten an
- **Eigene Agenten**: füge jeden Terminal-Agenten mit eigenem Icon hinzu und er funktioniert wie ein integrierter
- **Status und Benachrichtigungen**: Aktivitätsanzeigen, Abschluss-Klänge und Dock-Badges, wenn ein Agent dich braucht
- **Integrierter Chat**: sprich mit Modellen in einem Chat-Panel, mit Inline-Tool-Freigaben und Plan-Review

<details>
<summary><strong>FAQ</strong></summary>
<br />

<details>
<summary>Ist Paradev eine Terminal-App oder eine Desktop-App?</summary>
<br />

Paradev ist eine Desktop-App, keine Terminal-App. Agenten laufen darin als Chat oder in einem Terminal. Daneben hast du einen Diff-Viewer, Pull Requests, einen In-App-Browser und einen Datei-Editor. [FAQ-Doku](https://docs.paradev.com/faq)

</details>

<details>
<summary>Muss ich ein Terminal verwenden, oder kann ich mit dem Coding-Agenten chatten?</summary>
<br />

Nein, Paradev kann eine Agenten-Session als Chat statt als Terminal anzeigen, und du genehmigst oder lehnst die Aktionen des Agenten mit einem Klick ab. Chat funktioniert mit Claude Code, Codex, OpenCode und Pi. Paradev startet die CLI, die du schon installiert hast, deshalb bleiben dein Login und deine Einstellungen erhalten. Der Umschalter **CLI** / **Chat** wechselt eine laufende Session, ohne dass Kontext verloren geht, und andere Agenten laufen in einem Paradev-Terminal. [Chat-Doku](https://docs.paradev.com/chat)

</details>

<details>
<summary>Unter welcher Lizenz steht Paradev, was kostet es und auf welchen Plattformen läuft es?</summary>
<br />

Paradev ist Open Source unter der MIT-Lizenz. Der Free-Plan umfasst lokale Arbeitsbereiche mit der Desktop-App und der CLI. Bezahlte Pläne bringen Funktionen wie Automatisierungen und Cloud-Arbeitsbereiche. Die Desktop-App läuft auf macOS, dazu gibt es ein experimentelles AppImage für Linux; Windows ist noch nicht verfügbar. [Preise](https://paradev.com/pricing) · [FAQ-Doku](https://docs.paradev.com/faq)

</details>

<details>
<summary>Ist Paradev dasselbe wie Superset? Hat es etwas mit Apache Superset zu tun?</summary>
<br />

Paradev hieß früher Superset, deshalb lautet der CLI-Befehl immer noch `superset`. Es hat nichts mit Apache Superset zu tun, dem Business-Intelligence-Tool. [Installations-Doku](https://docs.paradev.com/install)

</details>

<details>
<summary>Welche Coding-Agenten unterstützt Paradev, und behalte ich meine eigenen Abos?</summary>
<br />

Paradev unterstützt Claude Code, Codex, OpenCode, Cursor Agent, Gemini CLI, Amp und weitere direkt, und du kannst jeden anderen CLI-Agenten hinzufügen. Claude Code, Codex, OpenCode und Pi können auch als Chat laufen. Agenten nutzen deine eigenen Abos und API-Keys, und Paradev leitet keine Modellaufrufe über eigene Server. [Doku zu unterstützten Agenten](https://docs.paradev.com/supported-agents)

</details>

<details>
<summary>Wie verhindere ich, dass sich mehrere Coding-Agenten in einem Repository gegenseitig überschreiben?</summary>
<br />

Paradev gibt jedem Agenten einen eigenen Arbeitsbereich: einen Git-Worktree auf einer eigenen Branch, mit eigenem Terminal. Agenten bearbeiten getrennte Kopien der Arbeitsdateien, sodass ein Agent die Änderungen eines anderen nicht überschreibt. Worktrees isolieren keine Prozesse in einer Sandbox, und Branches können beim Mergen trotzdem Konflikte haben. [Arbeitsbereiche-Doku](https://docs.paradev.com/workspaces)

</details>

<details>
<summary>Ich habe zu viele Claude-Code-Sessions im Terminal. Wie behalte ich den Überblick?</summary>
<br />

Paradev zeigt jede Agenten-Session in einer Seitenleiste, nach Projekt gruppiert und jeweils mit Status, egal ob die Session als Chat oder in einem Terminal läuft. Claude Code meldet, wenn es fertig ist und wenn es auf deine Eingabe wartet, und die Seitenleiste markiert Arbeitsbereiche, die dich brauchen. [Agentenstatus-Doku](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Kann ich zwei Coding-Agenten auf dieselbe Aufgabe ansetzen und die Ergebnisse vergleichen?</summary>
<br />

Ja, in Paradev gibst du denselben Prompt an zwei oder mehr Arbeitsbereiche, jeden auf seiner eigenen Branch, mit demselben Agenten oder mit verschiedenen. Dann vergleichst du die Diffs und behältst das beste Ergebnis. [Rezept: Agenten gegeneinander antreten lassen](https://docs.paradev.com/recipes/race-agents)

</details>

<details>
<summary>Kann ich Claude Code und Codex zusammen nutzen, wobei einer Code schreibt und der andere ihn reviewt?</summary>
<br />

Ja, Paradev führt Claude Code und Codex nebeneinander aus, jeweils als Chat oder in einem Terminal. Für ein Review markierst du Zeilen im Tab **Code** eines Pull Requests und schickst sie an den anderen Agenten, oder du nutzt **Continue with another agent**, um eine Session mit einem anderen Agenten und dem aktuellen Kontext zu starten. [Doku zu Agenten-Sessions](https://docs.paradev.com/agent-sessions)

</details>

<details>
<summary>Wie prüfe ich den Diff eines Coding-Agenten und schicke Rückfragen, bevor ich merge?</summary>
<br />

Paradev zeigt die Änderungen jedes Arbeitsbereichs in einem Diff-Viewer, in dem du committest, pushst und einen Pull Request öffnest. Im Tab **Code** des Pull Requests markierst du Zeilen und schickst einen Kommentar an einen laufenden Agenten oder eine neue Session; ihn auf GitHub zu posten ist optional. In derselben Ansicht kannst du die Checks verfolgen und mergen. [Pull-Request-Doku](https://docs.paradev.com/pull-requests)

</details>

<details>
<summary>Wie halte ich Dev-Server, Ports und Vorschau jeder Branch getrennt?</summary>
<br />

Paradev hält jede Branch in einem eigenen Worktree und zeigt die Ports, auf denen die Prozesse jedes Arbeitsbereichs lauschen, nach Arbeitsbereich gruppiert. Wähle einen Port, um den Dev-Server dieser Branch im In-App-Browser zu öffnen. Paradev vergibt keine Portbereiche, also lege die Konfiguration pro Arbeitsbereich in einem Setup-Skript fest. Es läuft in jedem neuen Arbeitsbereich, mit Variablen wie `SUPERSET_WORKSPACE_PATH`. [Ports-Doku](https://docs.paradev.com/ports)

</details>

<details>
<summary>Kann ich ein Element in meiner laufenden Web-App anklicken und es von einem Coding-Agenten ändern lassen?</summary>
<br />

Ja, Paradev hat einen Design-Modus in seinem In-App-Browser: Öffne deinen Dev-Server, schalte **Design** ein und klicke auf das Element. Dann beschreibst du die Änderung, und der Agent bekommt die Details des Elements und einen Screenshot mit deiner Notiz. [Browser-Doku](https://docs.paradev.com/browser)

</details>

<details>
<summary>Kann ich benachrichtigt werden, wenn ein Coding-Agent meine Eingabe braucht?</summary>
<br />

Ja, die Paradev-Desktop-App benachrichtigt dich, wenn ein Agent fertig ist oder anhält, um auf deine Eingabe zu warten, und das Dock-Symbol unter macOS zeigt ein Badge. Das hängt vom Agenten ab: Claude Code meldet beide Zustände, manche Agenten melden nur, wenn sie fertig sind. In der mobilen App zeigt ein Punkt am Arbeitsbereich, dass ein Agent deine Erlaubnis braucht; Push-Benachrichtigungen sind noch nicht verfügbar. [Agentenstatus-Doku](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Kann ich meine Coding-Agenten vom iPhone aus prüfen und ihnen antworten?</summary>
<br />

Ja, mit Paradev für iPhone und iPad startest du Agenten, verfolgst ihre Sessions live, antwortest ihnen und prüfst ihre Änderungen. Dafür brauchst du iOS 26 oder iPadOS 26 oder neuer und Paradev Pro; außerdem gibt es eine Android-App bei Google Play. Für Arbeitsbereiche auf deinem Computer schalte den Remote-Zugriff ein und halte den Computer wach und online. [Doku zur mobilen App](https://docs.paradev.com/mobile)

</details>

<details>
<summary>Kann ein Coding-Agent nach Zeitplan laufen, etwa für nächtliche Wartung oder einen wöchentlichen Check auf instabile Tests?</summary>
<br />

Ja, Paradev-Automatisierungen starten einen Agenten stündlich, täglich, wöchentlich oder nach einem eigenen Zeitplan. Jeder Lauf erstellt einen Arbeitsbereich, in dem du die Änderungen prüfst und die Arbeit fortsetzt. Automatisierungen erfordern den Pro-Plan. [Automatisierungs-Doku](https://docs.paradev.com/automations)

</details>

<details>
<summary>Kann ich einen Coding-Agenten aus Slack, Linear, Sentry oder einem GitHub-Pull-Request starten?</summary>
<br />

Ja, Paradev-Automatisierungen starten einen Agenten, wenn ein GitHub-Pull-Request-Event, eine Slack-Nachricht, ein Linear-Issue, ein Sentry-Issue oder ein Webhook eintrifft, und der Agent bekommt die Event-Details zusammen mit deinem Prompt. Du kannst auch den Paradev-Bot in Slack erwähnen, um einen Cloud-Arbeitsbereich mit Agent zu starten. Automatisierungen und die Slack-Integration erfordern den Pro-Plan. [Automatisierungs-Doku](https://docs.paradev.com/automations)

</details>

<details>
<summary>Kann ich Coding-Agenten über die Kommandozeile oder von einem anderen Agenten aus starten?</summary>
<br />

Ja, die Paradev-CLI erstellt Arbeitsbereiche und startet darin Agenten, aus einem Shell-Skript oder von einem anderen Agenten aus. Agenten können außerdem den Paradev-MCP-Server nutzen, um mit Arbeitsbereichen und Terminals zu arbeiten. Die Desktop-App enthält einen Orchestrate-Skill, mit dem ein Agent Worker in getrennten Arbeitsbereichen koordiniert. [CLI-Doku](https://docs.paradev.com/cli/getting-started)

</details>

<details>
<summary>Kann ich Coding-Agenten auf einem entfernten Rechner oder in der Cloud ausführen und die Änderungen von meinem Laptop aus prüfen?</summary>
<br />

Ja, mit dem Remote-Zugriff von Paradev (Pro-Plan) öffnest du von deinem Laptop aus Arbeitsbereiche, die auf einem anderen Rechner liegen, etwa einem Mac mini oder einem Server. Cloud-Arbeitsbereiche (Team- und Ultra-Plan) führen jeden Arbeitsbereich auf einer eigenen Cloud-Maschine aus, sodass Agenten weiterarbeiten, wenn dein Laptop zugeklappt ist. [Remote-Zugriff-Doku](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Kann ich später zu einer Aufgabe zurückkehren, und ihre Agenten-Session und Branch sind noch da?</summary>
<br />

Ja, ein Paradev-Arbeitsbereich bleibt als Git-Worktree auf seiner Branch auf der Festplatte, bis du ihn löschst. Terminals gehören zu einem Hintergrundprozess, deshalb laufen sie weiter und behalten ihren Scrollback, wenn du die App schließt oder aktualisierst. Stoppt ein Terminal nach einem Absturz oder Neustart, kann Paradev die Agenten-Session fortsetzen, sofern der Agent das unterstützt, etwa Claude Code und Codex. [Doku: Agenten am Laufen halten](https://docs.paradev.com/keep-agents-running)

</details>

<details>
<summary>Kann sich ein kleines Team einen Rechner für Coding-Agenten teilen?</summary>
<br />

Ja, ein Paradev-Host kann ein gemeinsam genutzter Rechner sein, etwa ein Mac mini, den Teammitglieder über Remote-Zugriff erreichen (Pro-Plan). Wenn der Host zum ersten Mal online geht, hat nur die Person Zugriff, die ihn gestartet hat. Diese Person fügt Teammitglieder unter **Settings → Hosts** hinzu. [Remote-Zugriff-Doku](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Wie unterscheidet sich Paradev von Conductor, Orca und Cursor?</summary>
<br />

Paradev, Conductor und Orca führen Coding-Agenten alle in parallelen Git-Worktrees aus, und Cursor ist ein KI-Editor, der um seinen eigenen Agenten herum gebaut ist. Paradev führt jeden CLI-Agenten mit deinen eigenen Abos aus und öffnet einen Arbeitsbereich in Cursor, wenn du dort bearbeiten willst. Orca ist ebenfalls Open Source und läuft auf Windows, was Paradev noch nicht unterstützt. Conductor wechselt zu Meta und nimmt keine neuen Nutzer mehr auf, und Paradev hat eine Anleitung, um Conductor-Arbeitsbereiche zu übernehmen. [Von Conductor migrieren](https://docs.paradev.com/migrate-from-conductor)

</details>

<details>
<summary>Ersetzt Paradev tmux?</summary>
<br />

Ja, für Coding-Agenten kann Paradev tmux ersetzen: Seine Terminal-Sessions laufen weiter, wenn du die App schließt, beendest oder aktualisierst. Jeder Arbeitsbereich bekommt außerdem seinen eigenen Worktree und Status in der Seitenleiste. Du kannst tmux trotzdem in einem Paradev-Terminal ausführen. [Doku: Agenten am Laufen halten](https://docs.paradev.com/keep-agents-running)

</details>

</details>

## Mehr als eine Desktop-App

Jede Oberfläche spricht mit denselben Arbeitsbereichen, du kannst also eine Aufgabe in der App starten und von überall nach ihr sehen.

| Oberfläche | Was du bekommst |
|:--------|:-------------|
| [**Desktop-App**](https://github.com/paradevai/paradev/releases/latest) | Die komplette IDE: Terminals, Diff-Viewer, In-App-Browser, Automatisierungen |
| [**CLI**](https://docs.paradev.com/cli/getting-started) | Ein einziges `superset`-Binary, um Arbeitsbereiche, Agenten, Terminals und Hosts aus jeder Shell zu verwalten |
| [**TypeScript-SDK**](https://docs.paradev.com/sdk/getting-started) | Steuere Paradev programmatisch mit [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) aus Node, Bun oder Deno |
| [**MCP-Server**](https://docs.paradev.com/mcp) | Lass Claude Code, Codex, Cursor und andere Agenten Arbeitsbereiche selbst erstellen und verwalten |

Die CLI ist in der Desktop-App enthalten, oder installiere sie eigenständig:

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
# or
brew install paradevai/tap/superset
```

Eine iOS-App kommt bald, damit du vom Smartphone aus nach deinen Agenten sehen kannst.

## Installation

Lade die Desktop-App herunter:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64-AppImage](https://github.com/paradevai/paradev/releases/latest/download/Paradev-x86_64.AppImage) (experimentell; macOS ist die primäre Zielplattform)
- **Windows**: noch nicht verfügbar
- [Alle Builds](https://github.com/paradevai/paradev/releases/latest)

Alles, was du installiert brauchst, ist [Git](https://git-scm.com/). [gh](https://cli.github.com/) ist optional und schaltet die PR-Workflows frei; Paradev bietet an, es für dich zu installieren.

## Entwicklung

Du willst an Paradev hacken oder eine PR beisteuern? Klone das Repository, füge es der
installierten Paradev-App hinzu und erstelle einen Arbeitsbereich für deine Änderung:

```bash
git clone https://github.com/paradevai/paradev.git
```

Führe dann das Entwicklungs-Setup im Terminal dieses Arbeitsbereichs aus:

```bash
./.paradev/setup.local.sh
bun run dev
```

Führe `setup.local.sh` einmal in jedem neuen Worktree aus. Es konfiguriert die
arbeitsbereichsspezifische App-Identität und Ports, damit die Entwicklungs-Desktop-App
neben der installierten Paradev-App und anderen Entwicklungs-Worktrees laufen kann.

Es sind weder ein Neon-Konto noch Zugangsdaten von Drittanbietern nötig. `setup.local.sh` startet
einen lokalen Postgres-+-Electric-Stack über Docker und legt ein Dev-Konto an. Melde dich
mit dem Button **„Sign in as dev“** an (oder `admin@local.test` / `supersetdev`).

Voraussetzungen: [Bun](https://bun.sh/) v1.4.3+ (in `.bun-version` gepinnt), `docker`, `jq` und `caddy`, das `bun dev` als lokalen HTTPS-Proxy verwendet (`brew install jq caddy && caddy trust`).

Siehe [**DEVELOPMENT.md**](../DEVELOPMENT.md) für die komplette Anleitung: was das Setup-Skript macht, manuelles Setup gegen echte Dienste, gängige Befehle, Fehlerbehebung und wie man die Desktop-App baut. Der Contribution-Prozess steht in [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Konfiguration

Konfiguriere Setup-, Teardown- und Run-Skripte für Arbeitsbereiche in `.paradev/config.json`. Siehe die [vollständige Dokumentation](https://docs.paradev.com/setup-teardown-scripts).

```json
{
  "setup": ["./.paradev/setup.sh"],
  "teardown": ["./.paradev/teardown.sh"],
  "run": ["./.paradev/run.sh"]
}
```

Tastenkürzel lassen sich unter **Einstellungen → Tastenkürzel** (⌘/) anpassen; siehe die [vollständige Liste der Tastenkürzel](https://docs.paradev.com/keyboard-shortcuts).

## Tech-Stack

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

## Standardmäßig privat

- **Explizite Verbindungen**: du entscheidest, welche Agenten, Provider und Integrationen verbunden werden.

## Mitmachen

Beiträge sind willkommen! Siehe [CONTRIBUTING.md](../CONTRIBUTING.md) für den Einstieg und wie du eine PR öffnest. Bugs und Feature-Wünsche gehören in die [Issues](https://github.com/paradevai/paradev/issues).

<a href="https://github.com/paradevai/paradev/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paradevai/paradev" />
</a>

## Community

Tritt der Paradev-Community bei, um Hilfe zu bekommen, Feedback zu teilen und dich mit anderen auszutauschen:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chatte mit dem Team und der Community
- **[Twitter](https://x.com/paradevai)**: folge uns für Updates und Ankündigungen
- **[GitHub Issues](https://github.com/paradevai/paradev/issues)**: melde Bugs und wünsch dir Features
- **[GitHub Discussions](https://github.com/paradevai/paradev/discussions)**: stell Fragen und teile Ideen

### Team

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Lizenz & was für immer kostenlos bleibt

**Die Desktop-App ist für immer kostenlos.** Agenten parallel auf deinem eigenen Rechner laufen zu lassen wird niemals etwas kosten. Alles, wofür wir Geld verlangen, wird ein optionaler Dienst obendrauf sein.

Die gesamte App liegt in diesem Repository unter der [MIT-Lizenz](../LICENSE.md): nutze sie, forke sie, verändere sie, hoste sie selbst und gib sie weiter.
