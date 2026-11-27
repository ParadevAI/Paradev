<div align="center">

<img width="full" alt="Claude a OpenCode pracují paralelně v pracovních prostorech Paradevu s živými diffy" src="../apps/marketing/public/images/readme-hero.gif" />

### Spusťte 100+ kódovacích agentů paralelně

<details>
<summary>🌐 Číst v jiných jazycích</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Toto je překlad anglického README, které je závazné.*

[![GitHub stars](https://img.shields.io/github/stars/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@paradevai-555?logo=x)](https://x.com/paradevai)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex nebo libovolný CLI agent, každý ve vlastním izolovaném worktree.<br />
Trávte čas dodáváním, ne čekáním.

<br />

[**Stáhnout pro macOS**](https://github.com/paradevai/paradev/releases/latest) &nbsp;&bull;&nbsp; [Dokumentace](https://docs.paradev.com) &nbsp;&bull;&nbsp; [Changelog](https://github.com/paradevai/paradev/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Kódujte 10x rychleji bez nákladů na přepínání

Paradev spouští CLI kódovací agenty paralelně v izolovaných git worktree, v terminálu nebo jako chat, s vestavěným terminálem, review a workflow otevření v editoru.

- **Spouštějte více agentů současně** bez režie přepínání kontextu
- **Izolujte každý úkol** ve vlastním git worktree, takže si agenti navzájem nezasahují do práce
- **Sledujte všechny své agenty** z jednoho místa a dostaňte upozornění, když potřebují pozornost
- **Rychle kontrolujte a upravujte změny** ve vestavěném diff prohlížeči a editoru
- **Otevřete kterýkoli pracovní prostor tam, kde ho potřebujete** — předání do editoru nebo terminálu jedním kliknutím
- **Dostaňte se ke svým pracovním prostorům odkudkoli** přes vzdálené hostitele, CLI, SDK nebo MCP

Méně čekání, více dodávání.

## Funkce

<table>
<tr>
<td width="50%" valign="middle">

### Paralelní pracovní prostory

Spusťte 100+ kódovacích agentů najednou, každého ve vlastním git worktree s vlastní větví, terminálem a prostředím. Porovnejte výsledky a slučte vítěze.

[Dokumentace →](https://docs.paradev.com/workspaces)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude streamuje migraci billingu, zatímco další agenti běží v paralelních pracovních prostorech" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Monitorování agentů

Sledujte každého agenta z postranního panelu — indikátory práce, zvuky dokončení a odznaky v docku, když někdo potřebuje vaši pozornost.

[Dokumentace →](https://docs.paradev.com/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Agent dokončuje svůj úkol a stav v postranním panelu se přepíná z práce na hotovo" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vestavěný terminál

Karty, neomezené rozdělení, předvolby a perzistentní relace, které přežijí restart. Stiskněte ⌘I pro bohatý editor promptů s víceřádkovými úpravami a @-zmínkami souborů.

[Dokumentace →](https://docs.paradev.com/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Psaní navazujícího dotazu s @-zmínkou souboru v bohatém editoru promptů vedle rozděleného terminálu" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vestavěný diff prohlížeč

Prohlížejte, komentujte a upravujte změny agentů bez opuštění aplikace, a až budou hotové, commitněte a pushněte je.

[Dokumentace →](https://docs.paradev.com/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Kontrola změn agenta v diff prohlížeči" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vestavěný prohlížeč a porty

Prohlížejte běžící dev servery v panelu prohlížeče. Porty se detekují pro každý pracovní prostor zvlášť, takže každý worktree má vlastní náhled.

[Dokumentace →](https://docs.paradev.com/browser)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Vestavěný prohlížeč s náhledem dev serveru a detekovanými porty" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatizace

Spouštějte relace agentů podle plánu: přes noc roztřiďte issues, připravte týdenní changelog, udržujte závislosti aktuální.

[Dokumentace →](https://docs.paradev.com/automations)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Naplánované automatizace agentů" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Vzdálený přístup

Připojte další počítač a dostaňte se k jeho pracovním prostorům odkudkoli: z desktopové aplikace, CLI nebo telefonu. Probuďte offline hostitele vlastním příkazem.

[Dokumentace →](https://docs.paradev.com/remote-access)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hostitelé a členové v nastavení organizace" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paradev CLI

Skriptujte z libovolného shellu: vytvářejte pracovní prostory, spouštějte agenty, čtěte jejich terminály a spravujte automatizace jedinou binárkou. Pokud agent umí spustit příkaz, umí řídit Paradev.

[Dokumentace →](https://docs.paradev.com/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Vytvoření pracovního prostoru a spuštění agenta ze Paradev CLI" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paleta příkazů

Přejděte na libovolný pracovní prostor, akci nebo nastavení z jednoho vyhledávacího pole.

[Dokumentace →](https://docs.paradev.com/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Psaní v paletě příkazů a živé filtrování akcí pracovního prostoru" width="100%" /></a>
</td>
</tr>
</table>

**Také v balení:**

- **[Vestavěné skills](https://docs.paradev.com/skills)**: agenti přicházejí s přednahranými skills `superset:*` (orchestrace paralelních agentů, plánování automatizací, odesílání zpětné vazby, diagnostika problémů), automaticky poskytnutými při spuštění
- **[Výběr modelu a vlastní agenti](https://docs.paradev.com/agent-integration)**: při spuštění zvolte model a úroveň uvažování a přidejte libovolného terminálového agenta s vlastní ikonou
- **[Skripty pro nastavení pracovního prostoru](https://docs.paradev.com/setup-teardown-scripts)**: automatizujte nastavení prostředí, instalaci závislostí a dev servery pro každý pracovní prostor
- **[Předvolby terminálu](https://docs.paradev.com/terminal-presets)**: uložte si rozložení agentů a shellů a otevřete je jedním stiskem klávesy
- **[Slack a Linear](https://docs.paradev.com/use-with-linear)**: vytvářejte pracovní prostory ze zpráv na Slacku nebo issues v Linearu
- **[Otevření ve vašem IDE](https://docs.paradev.com/use-with-ide)**: předání jedním kliknutím do Cursoru, VS Code nebo jakéhokoli editoru
- **[Vlastní motivy](https://docs.paradev.com/custom-themes)**: vytvářejte, upravujte a importujte soubory motivů
- **[Klávesové zkratky](https://docs.paradev.com/keyboard-shortcuts)**: každou akci lze přemapovat přes **Nastavení → Klávesové zkratky** (⌘/)
- **[Přineste si vlastní poskytovatele](https://docs.paradev.com/providers)**: připojte OpenRouter, Bedrock, Vertex nebo Vercel AI Gateway
- **A mnoho dalšího**: dodáváme denně, takže tento seznam je věčně pozadu. Skutečný seznam funkcí je [changelog](https://paradev.com/changelog).

## Podporovaní agenti

Paradev funguje s libovolným CLI kódovacím agentem, mimo jiné:

| Agent | Stav |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Plně podporován |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Plně podporován |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Plně podporován |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Plně podporován |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/muse-white.svg" /><img height="16" align="top" alt="Muse Code" src="../packages/ui/src/assets/icons/preset-icons/muse.svg" /></picture> &nbsp;[Muse Code](https://developer.meta.com/ai/products/muse-code/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/devin-white.svg" /><img height="16" align="top" alt="Devin" src="../packages/ui/src/assets/icons/preset-icons/devin.svg" /></picture> &nbsp;[Devin](https://devin.ai/cli) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Plně podporován |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Plně podporován |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Plně podporován |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Plně podporován |
| Jakýkoli jiný CLI agent | Funguje bez konfigurace |

Pokud běží v terminálu, běží na Paradevu

Agenti dostávají víc než jen terminál:

- **Výběr modelu**: při spuštění agenta zvolte model a úroveň uvažování
- **Nastavení pro každého agenta**: dolaďte spouštěcí příkazy, šablony promptů a přepsání modelu v Nastavení → Agenti
- **Vlastní agenti**: přidejte libovolného terminálového agenta s vlastní ikonou a bude fungovat jako vestavěný
- **Stav a upozornění**: indikátory práce, zvuky dokončení a odznaky v docku, když vás agent potřebuje
- **Vestavěný chat**: mluvte s modely v chatovacím panelu, s inline schvalováním nástrojů a kontrolou plánu

<details>
<summary><strong>Časté dotazy</strong></summary>
<br />

<details>
<summary>Je Paradev terminálová, nebo desktopová aplikace?</summary>
<br />

Paradev je desktopová aplikace, ne terminálová. Agenti v ní běží jako chat nebo v terminálu. Vedle nich máte diff prohlížeč, pull requesty, vestavěný prohlížeč a editor souborů. [Dokumentace FAQ](https://docs.paradev.com/faq)

</details>

<details>
<summary>Musím používat terminál, nebo můžu s kódovacím agentem chatovat?</summary>
<br />

Nemusíte, Paradev umí zobrazit relaci agenta jako chat místo terminálu a akce agenta schválíte nebo odmítnete jedním kliknutím. Chat funguje s Claude Code, Codex, OpenCode a Pi; Paradev spouští CLI, které už máte nainstalované, takže zachová vaše přihlášení i nastavení. Přepínač **CLI** / **Chat** přepne běžící relaci bez ztráty kontextu a ostatní agenti běží v terminálu Paradevu. [Dokumentace chatu](https://docs.paradev.com/chat)

</details>

<details>
<summary>Pod jakou licencí je Paradev, kolik stojí a na jakých platformách běží?</summary>
<br />

Paradev je open source pod licencí MIT. Plán Free pokrývá lokální pracovní prostory s desktopovou aplikací a CLI. Placené plány přidávají funkce jako automatizace a cloudové pracovní prostory. Desktopová aplikace běží na macOS a Linuxu; Windows zatím není k dispozici. [Ceník](https://paradev.com/pricing) · [Dokumentace FAQ](https://docs.paradev.com/faq)

</details>

<details>
<summary>Je Paradev totéž co Superset? Souvisí s Apache Superset?</summary>
<br />

Paradev se dříve jmenoval Superset, a proto je příkaz CLI stále `superset`. Nesouvisí s Apache Superset, nástrojem pro business intelligence. [Dokumentace instalace](https://docs.paradev.com/install)

</details>

<details>
<summary>Které kódovací agenty Paradev podporuje a zůstanou mi vlastní předplatné?</summary>
<br />

Paradev má vestavěnou podporu pro Claude Code, Codex, OpenCode, Cursor Agent, Gemini CLI, Amp a další a můžete přidat jakéhokoli jiného CLI agenta. Claude Code, Codex, OpenCode a Pi mohou běžet také jako chat. Agenti používají vaše vlastní předplatné a API klíče a Paradev volání modelů nepřeposílá přes proxy. [Dokumentace podporovaných agentů](https://docs.paradev.com/supported-agents)

</details>

<details>
<summary>Jak zabránit tomu, aby si více kódovacích agentů v jednom repozitáři navzájem přepisovalo práci?</summary>
<br />

Paradev dává každému agentovi vlastní pracovní prostor: Git worktree na vlastní větvi, s vlastním terminálem. Agenti upravují oddělené kopie pracovních souborů, takže jeden agent nepřepíše změny jiného. Worktree neizolují procesy v sandboxu a větve se při slučování stále mohou dostat do konfliktu. [Dokumentace pracovních prostorů](https://docs.paradev.com/workspaces)

</details>

<details>
<summary>Mám příliš mnoho terminálových relací Claude Code. Jak se v nich vyznat?</summary>
<br />

Paradev zobrazuje všechny relace agentů v jednom postranním panelu, seskupené podle projektu, se stavem u každé z nich, ať relace běží jako chat, nebo v terminálu. Claude Code hlásí, kdy skončí a kdy čeká na váš vstup, a postranní panel označí pracovní prostory, které vás potřebují. [Dokumentace stavu agentů](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Můžu spustit dva kódovací agenty na stejný úkol a porovnat výsledky?</summary>
<br />

Ano, v Paradevu zadáte stejný prompt dvěma nebo více pracovním prostorům, každému na vlastní větvi, se stejným agentem nebo s různými agenty. Pak porovnáte diffy a ponecháte nejlepší výsledek. [Návod: závod agentů](https://docs.paradev.com/recipes/race-agents)

</details>

<details>
<summary>Můžu používat Claude Code a Codex společně, aby jeden psal kód a druhý ho kontroloval?</summary>
<br />

Ano, Paradev spouští Claude Code a Codex vedle sebe, každý jako chat nebo v terminálu. Pro review vyberte řádky na kartě **Code** pull requestu a pošlete je druhému agentovi, nebo použijte **Continue with another agent** a spusťte relaci jiného agenta s nedávným kontextem. [Dokumentace relací agentů](https://docs.paradev.com/agent-sessions)

</details>

<details>
<summary>Jak zkontrolovat diff kódovacího agenta a poslat další pokyny ještě před sloučením?</summary>
<br />

Paradev zobrazuje změny každého pracovního prostoru v diff prohlížeči, kde provedete commit, push a otevřete pull request. Na kartě **Code** pull requestu vyberte řádky a pošlete komentář běžícímu agentovi nebo nové relaci; zveřejnění na GitHubu je volitelné. Ve stejném zobrazení můžete sledovat checky a provést sloučení. [Dokumentace pull requestů](https://docs.paradev.com/pull-requests)

</details>

<details>
<summary>Jak udržet dev server, porty a náhled každé větve odděleně?</summary>
<br />

Paradev drží každou větev ve vlastním worktree a zobrazuje porty, na kterých naslouchají procesy jednotlivých pracovních prostorů, seskupené podle pracovního prostoru. Výběrem portu otevřete dev server dané větve ve vestavěném prohlížeči. Paradev nepřiděluje rozsahy portů, takže konfiguraci pro jednotlivé pracovní prostory nastavte v setup skriptu, který běží v každém novém pracovním prostoru s proměnnými jako `SUPERSET_WORKSPACE_PATH`. [Dokumentace portů](https://docs.paradev.com/ports)

</details>

<details>
<summary>Můžu kliknout na prvek ve své běžící webové aplikaci a nechat kódovacího agenta ho změnit?</summary>
<br />

Ano, Paradev má ve vestavěném prohlížeči režim Design: otevřete svůj dev server, zapněte **Design** a klikněte na prvek. Pak popíšete změnu a agent dostane podrobnosti o prvku a snímek obrazovky s vaší poznámkou. [Dokumentace prohlížeče](https://docs.paradev.com/browser)

</details>

<details>
<summary>Můžu dostat upozornění, když kódovací agent potřebuje můj vstup?</summary>
<br />

Ano, desktopová aplikace Paradev vás upozorní, když agent skončí nebo se zastaví a čeká na váš vstup, a ikona v docku macOS zobrazí odznak. Podpora se liší podle agenta: Claude Code hlásí oba stavy a někteří agenti hlásí jen dokončení. V mobilní aplikaci tečka u pracovního prostoru ukazuje, že agent potřebuje vaše oprávnění; push notifikace zatím nejsou k dispozici. [Dokumentace stavu agentů](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Můžu sledovat své kódovací agenty a odpovídat jim z iPhonu?</summary>
<br />

Ano, Paradev pro iPhone a iPad vám umožní spouštět agenty, sledovat jejich relace živě, odpovídat jim a kontrolovat jejich změny. Vyžaduje iOS 26 nebo iPadOS 26 či novější a Paradev Pro a na Google Play je také aplikace pro Android. U pracovních prostorů na vašem počítači zapněte Vzdálený přístup a nechte počítač zapnutý a online. [Dokumentace mobilní aplikace](https://docs.paradev.com/mobile)

</details>

<details>
<summary>Může kódovací agent běžet podle plánu, třeba noční údržba nebo týdenní kontrola nestabilních testů?</summary>
<br />

Ano, automatizace Paradevu spouštějí agenta podle hodinového, denního, týdenního nebo vlastního plánu. Každé spuštění vytvoří pracovní prostor, ve kterém zkontrolujete změny a budete pokračovat v práci. Automatizace vyžadují plán Pro. [Dokumentace automatizací](https://docs.paradev.com/automations)

</details>

<details>
<summary>Můžu spustit kódovacího agenta ze Slacku, Linearu, Sentry nebo z pull requestu na GitHubu?</summary>
<br />

Ano, automatizace Paradevu spustí agenta, když přijde událost pull requestu z GitHubu, zpráva ze Slacku, issue z Linearu, issue ze Sentry nebo webhook, a agent dostane podrobnosti události spolu s vaším promptem. Můžete také ve Slacku zmínit bota Paradev a spustit tak cloudový pracovní prostor a agenta. Automatizace a integrace se Slackem vyžadují plán Pro. [Dokumentace automatizací](https://docs.paradev.com/automations)

</details>

<details>
<summary>Můžu spouštět kódovací agenty z příkazové řádky nebo z jiného agenta?</summary>
<br />

Ano, CLI Paradevu vytváří pracovní prostory a spouští v nich agenty ze shellového skriptu nebo z jiného agenta. Agenti mohou také používat MCP server Paradevu k práci s pracovními prostory a terminály. Desktopová aplikace obsahuje skill orchestrate, se kterým jeden agent koordinuje další agenty v oddělených pracovních prostorech. [Dokumentace CLI](https://docs.paradev.com/cli/getting-started)

</details>

<details>
<summary>Můžu spouštět kódovací agenty na vzdáleném stroji nebo v cloudu a kontrolovat změny z notebooku?</summary>
<br />

Ano, se vzdáleným přístupem Paradevu (plán Pro) otevřete z notebooku pracovní prostory hostované na jiném stroji, například na Mac mini nebo serveru. Cloudové pracovní prostory (plány Team a Ultra) spouštějí každý pracovní prostor na vlastním cloudovém stroji, takže agenti pracují dál, i když máte notebook zavřený. [Dokumentace vzdáleného přístupu](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Můžu se k úkolu vrátit později a najít tam stále jeho relaci agenta i větev?</summary>
<br />

Ano, pracovní prostor Paradevu zůstává na disku jako Git worktree na své větvi, dokud ho nesmažete. Terminály patří procesu na pozadí, takže běží dál a zachovají si historii posouvání, i když aplikaci zavřete nebo aktualizujete. Pokud se terminál po pádu nebo restartu zastaví, Paradev umí obnovit relaci agenta u agentů, kteří obnovení podporují, jako jsou Claude Code a Codex. [Dokumentace: agenti běžící dál](https://docs.paradev.com/keep-agents-running)

</details>

<details>
<summary>Může malý tým sdílet jeden stroj pro kódovací agenty?</summary>
<br />

Ano, hostem Paradevu může být sdílený stroj, například Mac mini, ke kterému se členové týmu připojují přes vzdálený přístup (plán Pro). Když host poprvé přejde online, přístup má jen osoba, která ho spustila. Tato osoba přidá členy týmu v **Settings → Hosts**. [Dokumentace vzdáleného přístupu](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Čím se Paradev liší od Conductor, Orca a Cursor?</summary>
<br />

Paradev, Conductor i Orca spouštějí kódovací agenty v paralelních Git worktree a Cursor je AI editor postavený kolem vlastního agenta. Paradev spouští jakéhokoli CLI agenta na vašem vlastním předplatném a otevře pracovní prostor v Cursoru, když v něm chcete upravovat. Orca je také open source a běží na Windows, které Paradev zatím nepodporuje. Conductor se připojuje k Meta a je uzavřený pro nové uživatele, a Paradev má návod, jak pracovní prostory z Conductor převést. [Migrace z Conductor](https://docs.paradev.com/migrate-from-conductor)

</details>

<details>
<summary>Nahradí Paradev tmux?</summary>
<br />

Ano, pro spouštění kódovacích agentů může Paradev nahradit tmux: jeho terminálové relace běží dál, i když aplikaci zavřete, ukončíte nebo aktualizujete. Každý pracovní prostor má navíc vlastní worktree a stav v postranním panelu. V terminálu Paradevu můžete tmux stále spouštět. [Dokumentace: agenti běžící dál](https://docs.paradev.com/keep-agents-running)

</details>

</details>

## Víc než desktopová aplikace

Každé rozhraní komunikuje se stejnými pracovními prostory, takže můžete úkol začít v aplikaci a zkontrolovat ho odkudkoli.

| Rozhraní | Co dostanete |
|:--------|:-------------|
| [**Desktopová aplikace**](https://github.com/paradevai/paradev/releases/latest) | Plnohodnotné IDE: terminály, diff prohlížeč, vestavěný prohlížeč, automatizace |
| [**CLI**](https://docs.paradev.com/cli/getting-started) | Jediná binárka `superset` pro správu pracovních prostorů, agentů, terminálů a hostitelů z libovolného shellu |
| [**TypeScript SDK**](https://docs.paradev.com/sdk/getting-started) | Řiďte Paradev programově pomocí [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) z Node, Bunu nebo Dena |
| [**MCP server**](https://docs.paradev.com/mcp) | Nechte Claude Code, Codex, Cursor a další agenty vytvářet a spravovat pracovní prostory samostatně |

CLI je přibalené k desktopové aplikaci, nebo ho nainstalujte samostatně:

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
# or
brew install paradevai/tap/superset
```

Brzy dorazí iOS aplikace, takže na své agenty dohlédnete i z telefonu.

## Instalace

Stáhněte si desktopovou aplikaci:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/paradevai/paradev/releases/latest/download/Paradev-x86_64.AppImage)
- **Windows**: zatím není k dispozici
- [Všechny buildy](https://github.com/paradevai/paradev/releases/latest)

Jediné, co potřebujete mít nainstalované, je [Git](https://git-scm.com/). [gh](https://cli.github.com/) je volitelný a odemyká PR workflow; Paradev vám ho nabídne nainstalovat.

## Vývoj

Chcete na Paradevu bastlit nebo přispět PR? Naklonujte repozitář, přidejte ho do
nainstalované aplikace Paradev a vytvořte pracovní prostor pro svou změnu:

```bash
git clone https://github.com/paradevai/paradev.git
```

Poté z terminálu daného pracovního prostoru spusťte vývojové nastavení:

```bash
./.paradev/setup.local.sh
bun run dev
```

Spusťte `setup.local.sh` jednou v každém novém worktree. Nakonfiguruje identitu
aplikace a porty specifické pro pracovní prostor, aby vývojová desktopová aplikace mohla
běžet vedle nainstalované aplikace Paradev a dalších vývojových worktree.

Není potřeba účet Neon ani přihlašovací údaje třetích stran. `setup.local.sh` nastartuje
lokální stack Postgres + Electric přes Docker a naplní dev účet. Přihlaste se
tlačítkem **"Sign in as dev"** (nebo `admin@local.test` / `supersetdev`).

Předpoklady: [Bun](https://bun.sh/) v1.4.3+ (připnutý v `.bun-version`), `docker`, `jq` a `caddy`, který `bun dev` spouští jako lokální HTTPS proxy (`brew install jq caddy && caddy trust`).

Kompletního průvodce najdete v [**DEVELOPMENT.md**](../DEVELOPMENT.md): co dělá skript nastavení, ruční nastavení proti skutečným službám, běžné příkazy, řešení problémů a jak sestavit desktopovou aplikaci. Proces přispívání je popsán v [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Konfigurace

Nakonfigurujte skripty setup, teardown a run pracovního prostoru v `.paradev/config.json`. Viz [úplná dokumentace](https://docs.paradev.com/setup-teardown-scripts).

```json
{
  "setup": ["./.paradev/setup.sh"],
  "teardown": ["./.paradev/teardown.sh"],
  "run": ["./.paradev/run.sh"]
}
```

Klávesové zkratky si můžete přizpůsobit přes **Nastavení → Klávesové zkratky** (⌘/); viz [úplný seznam zkratek](https://docs.paradev.com/keyboard-shortcuts).

## Technologie

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

## Ve výchozím stavu soukromé

- **Explicitní připojení**: sami si volíte, které agenty, poskytovatele a integrace připojíte.

## Přispívání

Příspěvky vítáme! V [CONTRIBUTING.md](../CONTRIBUTING.md) najdete, jak se nastavit a otevřít PR. Chyby a požadavky na funkce patří do [issues](https://github.com/paradevai/paradev/issues).

<a href="https://github.com/paradevai/paradev/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paradevai/paradev" />
</a>

## Komunita

Připojte se ke komunitě Paradevu — získáte pomoc, můžete sdílet zpětnou vazbu a poznat další uživatele:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: chatujte s týmem a komunitou
- **[Twitter](https://x.com/paradevai)**: sledujte novinky a oznámení
- **[GitHub Issues](https://github.com/paradevai/paradev/issues)**: hlaste chyby a žádejte o funkce
- **[GitHub Discussions](https://github.com/paradevai/paradev/discussions)**: ptejte se a sdílejte nápady

### Tým

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licence a co je navždy zdarma

**Desktopová aplikace je navždy zdarma.** Paralelní spouštění agentů na vlastním počítači nebude nikdy vyžadovat platbu. Cokoli zpoplatníme, bude volitelná služba navíc.

Celá aplikace je v tomto repozitáři pod licencí [MIT](../LICENSE.md): používejte ji, forkněte ji, upravujte ji, provozujte ji na vlastní infrastruktuře a šiřte ji dál.
