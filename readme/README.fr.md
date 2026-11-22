<div align="center">

<img width="full" alt="Claude et OpenCode travaillant en parallèle dans des espaces de travail Paradev avec des diffs en direct" src="../apps/marketing/public/images/readme-hero.gif" />

### Exécutez plus de 100 agents de codage en parallèle

<details>
<summary>🌐 Lire dans une autre langue</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*Ceci est une traduction du [README anglais](../README.md), qui reste la version de référence.*

[![GitHub stars](https://img.shields.io/github/stars/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@paradevai-555?logo=x)](https://x.com/paradevai)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex ou n'importe quel agent CLI, chacun dans son propre worktree isolé.<br />
Passez votre temps à livrer, pas à attendre.

<br />

[**Télécharger pour macOS**](https://github.com/paradevai/paradev/releases/latest) &nbsp;&bull;&nbsp; [Documentation](https://docs.paradev.com) &nbsp;&bull;&nbsp; [Changelog](https://github.com/paradevai/paradev/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Codez 10x plus vite, sans coût de changement de contexte

Paradev exécute des agents de codage en ligne de commande en parallèle dans des worktrees git isolés, dans un terminal ou sous forme de chat, avec terminal, revue de code et ouverture dans l'éditeur intégrés.

- **Exécutez plusieurs agents simultanément** sans la surcharge du changement de contexte
- **Isolez chaque tâche** dans son propre worktree git pour que les agents n'interfèrent pas entre eux
- **Surveillez tous vos agents** depuis un seul endroit et soyez notifié quand ils ont besoin de vous
- **Relisez et modifiez les changements rapidement** avec la visionneuse de diff et l'éditeur intégrés
- **Ouvrez n'importe quel espace de travail là où vous en avez besoin** avec une passation en un clic vers votre éditeur ou votre terminal
- **Accédez à vos espaces de travail depuis n'importe où** via les hôtes distants, la CLI, le SDK ou MCP

Attendez moins, livrez plus.

## Fonctionnalités

<table>
<tr>
<td width="50%" valign="middle">

### Espaces de travail parallèles

Exécutez plus de 100 agents de codage à la fois, chacun dans son propre worktree git avec sa propre branche, son terminal et son environnement. Comparez les résultats et mergez le gagnant.

[Docs →](https://docs.paradev.com/workspaces)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude diffusant une migration de facturation pendant que d'autres agents tournent dans des espaces de travail parallèles" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Supervision des agents

Suivez chaque agent depuis la barre latérale, avec indicateurs d'activité, carillons de fin de tâche et badges sur le dock quand l'un d'eux a besoin de votre attention.

[Docs →](https://docs.paradev.com/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="Un agent terminant sa tâche et le statut de la barre latérale passant de « en cours » à « terminé »" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Terminal intégré

Onglets, divisions illimitées, préréglages et sessions persistantes qui survivent aux redémarrages. Appuyez sur ⌘I pour un éditeur de prompt enrichi avec édition multiligne et mentions de fichiers via @.

[Docs →](https://docs.paradev.com/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="Saisie d'une relance avec une mention de fichier @ dans l'éditeur de prompt enrichi à côté d'un terminal divisé" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Visionneuse de diff intégrée

Inspectez, commentez et modifiez les changements des agents sans quitter l'app, puis faites commit et push quand c'est prêt.

[Docs →](https://docs.paradev.com/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="Revue des changements d'un agent dans la visionneuse de diff" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Navigateur intégré et ports

Prévisualisez les serveurs de dev en cours d'exécution dans un panneau navigateur. Les ports sont détectés par espace de travail, chaque worktree a donc son propre aperçu.

[Docs →](https://docs.paradev.com/browser)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="Navigateur intégré prévisualisant un serveur de dev avec les ports détectés" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Automatisations

Exécutez des sessions d'agent selon un planning : triez les issues pendant la nuit, rédigez le changelog hebdomadaire, gardez les dépendances à jour.

[Docs →](https://docs.paradev.com/automations)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="Automatisations d'agents planifiées" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Accès distant

Connectez une autre machine et accédez à ses espaces de travail depuis n'importe où : l'app de bureau, la CLI ou votre téléphone. Réveillez les hôtes hors ligne avec une commande personnalisée.

[Docs →](https://docs.paradev.com/remote-access)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="Hôtes et membres dans les paramètres de l'organisation" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### CLI Paradev

Scriptez tout depuis n'importe quel shell : créez des espaces de travail, lancez des agents, lisez leurs terminaux et gérez les automatisations avec un seul binaire. Si un agent peut exécuter une commande, il peut piloter Paradev.

[Docs →](https://docs.paradev.com/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Création d'un espace de travail et lancement d'un agent depuis la CLI Paradev" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Palette de commandes

Accédez à n'importe quel espace de travail, action ou paramètre depuis une seule zone de recherche.

[Docs →](https://docs.paradev.com/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="Saisie dans la palette de commandes et filtrage en direct des actions d'espace de travail" width="100%" /></a>
</td>
</tr>
</table>

**Également inclus :**

- **[Compétences intégrées](https://docs.paradev.com/skills)** : les agents arrivent préchargés avec les compétences `superset:*` (orchestrer des agents parallèles, planifier des automatisations, envoyer des retours, diagnostiquer des problèmes), provisionnées automatiquement au lancement
- **[Sélecteur de modèle et agents personnalisés](https://docs.paradev.com/agent-integration)** : choisissez un modèle et un niveau de raisonnement au lancement, et ajoutez n'importe quel agent de terminal avec sa propre icône
- **[Scripts de configuration d'espace de travail](https://docs.paradev.com/setup-teardown-scripts)** : automatisez la configuration de l'environnement, l'installation des dépendances et les serveurs de dev par espace de travail
- **[Préréglages de terminal](https://docs.paradev.com/terminal-presets)** : enregistrez des dispositions d'agents et de shells et ouvrez-les d'une seule touche
- **[Slack et Linear](https://docs.paradev.com/use-with-linear)** : créez des espaces de travail depuis des messages Slack ou des issues Linear
- **[Ouvrir dans votre IDE](https://docs.paradev.com/use-with-ide)** : passation en un clic vers Cursor, VS Code ou n'importe quel éditeur
- **[Thèmes personnalisés](https://docs.paradev.com/custom-themes)** : créez, modifiez et importez des fichiers de thème
- **[Raccourcis clavier](https://docs.paradev.com/keyboard-shortcuts)** : chaque action est remappable via **Paramètres → Raccourcis clavier** (⌘/)
- **[Apportez vos propres fournisseurs](https://docs.paradev.com/providers)** : connectez OpenRouter, Bedrock, Vertex ou Vercel AI Gateway
- **Et bien plus encore** : nous livrons tous les jours, cette liste est donc perpétuellement en retard. Le [changelog](https://paradev.com/changelog) est la vraie liste des fonctionnalités.

## Agents pris en charge

Paradev fonctionne avec n'importe quel agent de codage en ligne de commande, notamment :

| Agent | Statut |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | Entièrement pris en charge |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/muse-white.svg" /><img height="16" align="top" alt="Muse Code" src="../packages/ui/src/assets/icons/preset-icons/muse.svg" /></picture> &nbsp;[Muse Code](https://developer.meta.com/ai/products/muse-code/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/devin-white.svg" /><img height="16" align="top" alt="Devin" src="../packages/ui/src/assets/icons/preset-icons/devin.svg" /></picture> &nbsp;[Devin](https://devin.ai/cli) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | Entièrement pris en charge |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Entièrement pris en charge |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | Entièrement pris en charge |
| Tout autre agent CLI | Fonctionne sans configuration |

S'il tourne dans un terminal, il tourne sur Paradev

Les agents obtiennent plus qu'un terminal :

- **Sélecteur de modèle** : choisissez un modèle et un niveau de raisonnement quand vous lancez un agent
- **Paramètres par agent** : ajustez les commandes de lancement, les modèles de prompt et les modèles de langage dans Paramètres → Agents
- **Agents personnalisés** : ajoutez n'importe quel agent de terminal avec sa propre icône et il fonctionne comme un agent intégré
- **Statut et notifications** : indicateurs d'activité, carillons de fin de tâche et badges sur le dock quand un agent a besoin de vous
- **Chat intégré** : discutez avec les modèles dans un panneau de chat, avec approbation des outils en ligne et revue de plan

<details>
<summary><strong>FAQ</strong></summary>
<br />

<details>
<summary>Paradev est-il une application de terminal ou une application de bureau ?</summary>
<br />

Paradev est une application de bureau, pas une application de terminal. Les agents y tournent sous forme de chat ou dans un terminal. À côté, vous disposez d'une visionneuse de diff, des pull requests, d'un navigateur intégré et d'un éditeur de fichiers. [Documentation FAQ](https://docs.paradev.com/faq)

</details>

<details>
<summary>Dois-je utiliser un terminal, ou puis-je discuter avec l'agent de codage dans un chat ?</summary>
<br />

Non, Paradev peut afficher une session d'agent sous forme de chat plutôt que de terminal, et vous approuvez ou refusez les actions de l'agent d'un clic. Le chat fonctionne avec Claude Code, Codex, OpenCode et Pi ; Paradev lance la CLI que vous avez déjà installée, vous gardez donc votre connexion et vos réglages. Le bouton **CLI** / **Chat** bascule une session en cours sans perdre le contexte, et les autres agents tournent dans un terminal Paradev. [Documentation du chat](https://docs.paradev.com/chat)

</details>

<details>
<summary>Quelle est la licence de Paradev, combien coûte-t-il et sur quelles plateformes fonctionne-t-il ?</summary>
<br />

Paradev est open source sous licence MIT. Le plan Free couvre les espaces de travail locaux avec l'application de bureau et la CLI. Les plans payants ajoutent des fonctionnalités comme les automatisations et les espaces de travail cloud. L'application de bureau fonctionne sur macOS, avec un AppImage Linux expérimental ; Windows n'est pas encore disponible. [Tarifs](https://paradev.com/pricing) · [Documentation FAQ](https://docs.paradev.com/faq)

</details>

<details>
<summary>Paradev est-il la même chose que Superset ? A-t-il un lien avec Apache Superset ?</summary>
<br />

Paradev s'appelait auparavant Superset, c'est pourquoi la commande de la CLI est toujours `superset`. Il n'a aucun lien avec Apache Superset, l'outil de business intelligence. [Documentation d'installation](https://docs.paradev.com/install)

</details>

<details>
<summary>Quels agents de codage Paradev prend-il en charge, et est-ce que je garde mes propres abonnements ?</summary>
<br />

Paradev prend en charge nativement Claude Code, Codex, OpenCode, Cursor Agent, Gemini CLI, Amp et d'autres, et vous pouvez ajouter n'importe quel autre agent CLI. Claude Code, Codex, OpenCode et Pi peuvent aussi tourner sous forme de chat. Les agents utilisent vos propres abonnements et clés API, et Paradev ne fait pas transiter les appels aux modèles par ses serveurs. [Documentation des agents pris en charge](https://docs.paradev.com/supported-agents)

</details>

<details>
<summary>Comment empêcher plusieurs agents de codage de s'écraser mutuellement dans un même dépôt ?</summary>
<br />

Paradev donne à chaque agent son propre espace de travail : un worktree Git sur sa propre branche, avec son propre terminal. Les agents modifient des copies séparées des fichiers de travail, donc un agent n'écrase pas les changements d'un autre. Les worktrees n'isolent pas les processus dans un sandbox, et les branches peuvent toujours entrer en conflit au moment du merge. [Documentation des espaces de travail](https://docs.paradev.com/workspaces)

</details>

<details>
<summary>J'ai trop de sessions Claude Code dans des terminaux. Comment m'y retrouver ?</summary>
<br />

Paradev affiche chaque session d'agent dans une seule barre latérale, regroupée par projet, avec un statut pour chacune, que la session tourne sous forme de chat ou dans un terminal. Claude Code signale quand il a terminé et quand il attend votre réponse, et la barre latérale met en évidence les espaces de travail qui ont besoin de vous. [Documentation du statut des agents](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Puis-je lancer deux agents de codage sur la même tâche et comparer les résultats ?</summary>
<br />

Oui, dans Paradev vous donnez le même prompt à deux espaces de travail ou plus, chacun sur sa propre branche, avec le même agent ou des agents différents. Vous comparez ensuite les diffs et gardez le meilleur résultat. [Recette : mettre des agents en concurrence](https://docs.paradev.com/recipes/race-agents)

</details>

<details>
<summary>Puis-je utiliser Claude Code et Codex ensemble, l'un écrivant le code et l'autre le relisant ?</summary>
<br />

Oui, Paradev exécute Claude Code et Codex côte à côte, chacun sous forme de chat ou dans un terminal. Pour obtenir une revue, sélectionnez des lignes dans l'onglet **Code** d'une pull request et envoyez-les à l'autre agent, ou utilisez **Continue with another agent** pour démarrer une session d'un autre agent avec le contexte récent. [Documentation des sessions d'agent](https://docs.paradev.com/agent-sessions)

</details>

<details>
<summary>Comment relire le diff d'un agent de codage et lui envoyer des retours avant de merger ?</summary>
<br />

Paradev affiche les changements de chaque espace de travail dans une visionneuse de diff, où vous faites commit et push et ouvrez une pull request. Dans l'onglet **Code** de la pull request, sélectionnez des lignes et envoyez un commentaire à un agent en cours ou à une nouvelle session ; le publier sur GitHub est facultatif. Vous pouvez suivre les checks et merger depuis la même vue. [Documentation des pull requests](https://docs.paradev.com/pull-requests)

</details>

<details>
<summary>Comment séparer le serveur de dev, les ports et l'aperçu de chaque branche ?</summary>
<br />

Paradev garde chaque branche dans son propre worktree et affiche les ports sur lesquels écoutent les processus de chaque espace de travail, regroupés par espace de travail. Sélectionnez un port pour ouvrir le serveur de dev de cette branche dans le navigateur intégré. Paradev n'attribue pas de plages de ports : définissez la configuration propre à chaque espace de travail dans un script de configuration, qui s'exécute dans chaque nouvel espace de travail avec des variables comme `SUPERSET_WORKSPACE_PATH`. [Documentation des ports](https://docs.paradev.com/ports)

</details>

<details>
<summary>Puis-je cliquer sur un élément de mon application web en cours d'exécution et demander à un agent de codage de le modifier ?</summary>
<br />

Oui, Paradev a un mode Design dans son navigateur intégré : ouvrez votre serveur de dev, activez **Design** et cliquez sur l'élément. Vous décrivez ensuite le changement, et l'agent reçoit les détails de l'élément et une capture d'écran avec votre note. [Documentation du navigateur](https://docs.paradev.com/browser)

</details>

<details>
<summary>Puis-je être notifié quand un agent de codage a besoin de moi ?</summary>
<br />

Oui, l'application de bureau Paradev vous notifie quand un agent termine ou s'arrête pour attendre votre réponse, et l'icône du dock macOS affiche un badge. Cela dépend de l'agent : Claude Code signale les deux états, et certains agents ne signalent que la fin de leur travail. Dans l'application mobile, un point sur l'espace de travail indique qu'un agent a besoin de votre autorisation ; les notifications push ne sont pas encore disponibles. [Documentation du statut des agents](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>Puis-je suivre mes agents de codage et leur répondre depuis mon iPhone ?</summary>
<br />

Oui, Paradev pour iPhone et iPad vous permet de démarrer des agents, de suivre leurs sessions en direct, de leur répondre et de relire leurs changements. Il faut iOS 26 ou iPadOS 26 ou version ultérieure et Paradev Pro, et il existe aussi une application Android sur Google Play. Pour les espaces de travail sur votre ordinateur, activez l'accès à distance et gardez l'ordinateur allumé et en ligne. [Documentation de l'application mobile](https://docs.paradev.com/mobile)

</details>

<details>
<summary>Un agent de codage peut-il tourner selon un planning, pour une maintenance nocturne ou une vérification hebdomadaire des tests instables ?</summary>
<br />

Oui, les automatisations Paradev lancent un agent toutes les heures, tous les jours, toutes les semaines ou selon un planning personnalisé. Chaque exécution crée un espace de travail où vous relisez les changements et poursuivez le travail. Les automatisations nécessitent le plan Pro. [Documentation des automatisations](https://docs.paradev.com/automations)

</details>

<details>
<summary>Puis-je lancer un agent de codage depuis Slack, Linear, Sentry ou une pull request GitHub ?</summary>
<br />

Oui, les automatisations Paradev lancent un agent à l'arrivée d'un événement de pull request GitHub, d'un message Slack, d'une issue Linear, d'une issue Sentry ou d'un webhook, et l'agent reçoit les détails de l'événement avec votre prompt. Vous pouvez aussi mentionner le bot Paradev dans Slack pour démarrer un espace de travail cloud et un agent. Les automatisations et l'intégration Slack nécessitent le plan Pro. [Documentation des automatisations](https://docs.paradev.com/automations)

</details>

<details>
<summary>Puis-je lancer des agents de codage depuis la ligne de commande ou depuis un autre agent ?</summary>
<br />

Oui, la CLI Paradev crée des espaces de travail et y démarre des agents depuis un script shell ou depuis un autre agent. Les agents peuvent aussi utiliser le serveur MCP de Paradev pour travailler avec les espaces de travail et les terminaux. L'application de bureau inclut une compétence orchestrate qui permet à un agent de coordonner des workers dans des espaces de travail séparés. [Documentation de la CLI](https://docs.paradev.com/cli/getting-started)

</details>

<details>
<summary>Puis-je exécuter des agents de codage sur une machine distante ou dans le cloud et relire les changements depuis mon portable ?</summary>
<br />

Oui, avec l'accès à distance de Paradev (plan Pro), vous ouvrez depuis votre portable des espaces de travail hébergés sur une autre machine, comme un Mac mini ou un serveur. Les espaces de travail cloud (plans Team et Ultra) exécutent chaque espace de travail sur sa propre machine cloud, donc les agents continuent de travailler quand votre portable est fermé. [Documentation de l'accès à distance](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Puis-je revenir plus tard à une tâche et retrouver sa session d'agent et sa branche ?</summary>
<br />

Oui, un espace de travail Paradev reste sur le disque sous forme de worktree Git sur sa branche jusqu'à ce que vous le supprimiez. Les terminaux appartiennent à un processus en arrière-plan : ils continuent de tourner et gardent leur historique de défilement quand vous fermez ou mettez à jour l'application. Si un terminal s'arrête après un crash ou un redémarrage, Paradev peut reprendre la session d'agent pour les agents qui prennent en charge la reprise, comme Claude Code et Codex. [Documentation : garder les agents actifs](https://docs.paradev.com/keep-agents-running)

</details>

<details>
<summary>Une petite équipe peut-elle partager une machine pour ses agents de codage ?</summary>
<br />

Oui, un hôte Paradev peut être une machine partagée, comme un Mac mini, à laquelle les membres de l'équipe accèdent via l'accès à distance (plan Pro). Quand l'hôte se connecte pour la première fois, seule la personne qui l'a démarré y a accès. Cette personne ajoute les membres de l'équipe dans **Settings → Hosts**. [Documentation de l'accès à distance](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>En quoi Paradev diffère-t-il de Conductor, Orca et Cursor ?</summary>
<br />

Paradev, Conductor et Orca exécutent tous des agents de codage dans des worktrees Git parallèles, et Cursor est un éditeur IA construit autour de son propre agent. Paradev exécute n'importe quel agent CLI avec vos propres abonnements, et ouvre un espace de travail dans Cursor quand vous voulez y faire vos modifications. Orca est lui aussi open source et fonctionne sous Windows, que Paradev ne prend pas encore en charge. Conductor rejoint Meta et n'accepte plus de nouveaux utilisateurs, et Paradev propose un guide pour migrer les espaces de travail Conductor. [Migrer depuis Conductor](https://docs.paradev.com/migrate-from-conductor)

</details>

<details>
<summary>Paradev remplace-t-il tmux ?</summary>
<br />

Oui, pour exécuter des agents de codage, Paradev peut remplacer tmux : ses sessions de terminal continuent de tourner quand vous fermez, quittez ou mettez à jour l'application. Chaque espace de travail a aussi son propre worktree et son statut dans la barre latérale. Vous pouvez toujours lancer tmux dans un terminal Paradev. [Documentation : garder les agents actifs](https://docs.paradev.com/keep-agents-running)

</details>

</details>

## Plus qu'une app de bureau

Chaque surface parle aux mêmes espaces de travail : vous pouvez démarrer une tâche dans l'app et la suivre depuis n'importe où.

| Surface | Ce que vous obtenez |
|:--------|:-------------|
| [**App de bureau**](https://github.com/paradevai/paradev/releases/latest) | L'IDE complet : terminaux, visionneuse de diff, navigateur intégré, automatisations |
| [**CLI**](https://docs.paradev.com/cli/getting-started) | Un seul binaire `superset` pour gérer espaces de travail, agents, terminaux et hôtes depuis n'importe quel shell |
| [**SDK TypeScript**](https://docs.paradev.com/sdk/getting-started) | Pilotez Paradev par programmation avec [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) depuis Node, Bun ou Deno |
| [**Serveur MCP**](https://docs.paradev.com/mcp) | Laissez Claude Code, Codex, Cursor et d'autres agents créer et gérer eux-mêmes des espaces de travail |

La CLI est fournie avec l'app de bureau, ou installez-la seule :

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
# or
brew install paradevai/tap/superset
```

Une app iOS arrive bientôt pour que vous puissiez suivre vos agents depuis votre téléphone.

## Installation

Téléchargez l'app de bureau :

- **macOS** : [Apple Silicon (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-x64.dmg)
- **Linux** : [AppImage x64](https://github.com/paradevai/paradev/releases/latest/download/Paradev-x86_64.AppImage) (expérimental ; macOS est la cible principale)
- **Windows** : pas encore disponible
- [Tous les builds](https://github.com/paradevai/paradev/releases/latest)

Tout ce dont vous avez besoin est [Git](https://git-scm.com/). [gh](https://cli.github.com/) est facultatif et débloque les workflows de PR ; Paradev propose de l'installer pour vous.

## Développement

Envie de bidouiller Paradev ou de contribuer une PR ? Clonez le dépôt, ajoutez-le à
l'app Paradev installée et créez un espace de travail pour votre changement :

```bash
git clone https://github.com/paradevai/paradev.git
```

Puis lancez la configuration de développement depuis le terminal de cet espace de travail :

```bash
./.paradev/setup.local.sh
bun run dev
```

Exécutez `setup.local.sh` une fois dans chaque nouveau worktree. Il configure l'identité
d'app et les ports propres à l'espace de travail pour que l'app de bureau de développement
puisse tourner à côté de l'app Paradev installée et des autres worktrees de développement.

Aucun compte Neon ni identifiant tiers n'est nécessaire. `setup.local.sh` démarre
une pile locale Postgres + Electric via Docker et amorce un compte de dev. Connectez-vous
avec le bouton **« Sign in as dev »** (ou `admin@local.test` / `supersetdev`).

Prérequis : [Bun](https://bun.sh/) v1.4.3+ (épinglé dans `.bun-version`), `docker`, `jq` et `caddy`, que `bun dev` exécute comme proxy HTTPS local (`brew install jq caddy && caddy trust`).

Voir [**DEVELOPMENT.md**](../DEVELOPMENT.md) pour le guide complet : ce que fait le script de configuration, la configuration manuelle avec de vrais services, les commandes courantes, le dépannage et comment builder l'app de bureau. Le processus de contribution est décrit dans [**CONTRIBUTING.md**](../CONTRIBUTING.md).

## Configuration

Configurez les scripts de setup, de teardown et de run des espaces de travail dans `.paradev/config.json`. Voir la [documentation complète](https://docs.paradev.com/setup-teardown-scripts).

```json
{
  "setup": ["./.paradev/setup.sh"],
  "teardown": ["./.paradev/teardown.sh"],
  "run": ["./.paradev/run.sh"]
}
```

Les raccourcis clavier sont personnalisables via **Paramètres → Raccourcis clavier** (⌘/) ; voir la [liste complète des raccourcis](https://docs.paradev.com/keyboard-shortcuts).

## Pile technique

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

## Privé par défaut

- **Connexions explicites** : c'est vous qui choisissez quels agents, fournisseurs et intégrations connecter.

## Contribuer

Les contributions sont les bienvenues ! Voir [CONTRIBUTING.md](../CONTRIBUTING.md) pour savoir comment vous installer et ouvrir une PR. Les bugs et demandes de fonctionnalités vont dans les [issues](https://github.com/paradevai/paradev/issues).

<a href="https://github.com/paradevai/paradev/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paradevai/paradev" />
</a>

## Communauté

Rejoignez la communauté Paradev pour obtenir de l'aide, partager vos retours et échanger avec d'autres utilisateurs :

- **[Discord](https://discord.gg/cZeD9WYcV7)** : discutez avec l'équipe et la communauté
- **[Twitter](https://x.com/paradevai)** : suivez-nous pour les mises à jour et les annonces
- **[GitHub Issues](https://github.com/paradevai/paradev/issues)** : signalez des bugs et demandez des fonctionnalités
- **[GitHub Discussions](https://github.com/paradevai/paradev/discussions)** : posez des questions et partagez vos idées

### Équipe

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## Licence et ce qui est gratuit pour toujours

**L'app de bureau est gratuite pour toujours.** Exécuter des agents en parallèle sur votre propre machine ne nécessitera jamais de paiement. Tout ce que nous facturerons sera un service optionnel en plus.

L'app entière est dans ce dépôt sous [licence MIT](../LICENSE.md) : utilisez-la, forkez-la, modifiez-la, hébergez-la vous-même et redistribuez-la.
