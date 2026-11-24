<div align="center">

<img width="full" alt="Claude 与 OpenCode 在并行的 Paradev 工作区中工作并实时显示差异" src="../apps/marketing/public/images/readme-hero.gif" />

### 并行运行 100+ 个编码智能体

<details>
<summary>🌐 其他语言版本</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*本文档是英文版 README 的翻译,内容以英文版为准。*

[![GitHub stars](https://img.shields.io/github/stars/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@paradevai-555?logo=x)](https://x.com/paradevai)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code、Codex 或任何 CLI 智能体,各自运行在独立的 worktree 中。<br />
把时间花在交付上,而不是等待上。

<br />

[**下载 macOS 版**](https://github.com/paradevai/paradev/releases/latest) &nbsp;&bull;&nbsp; [文档](https://docs.paradev.com) &nbsp;&bull;&nbsp; [更新日志](https://github.com/paradevai/paradev/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## 零切换成本,编码快 10 倍

Paradev 在相互隔离的 git worktree 中并行运行基于 CLI 的编码智能体,在终端中或以聊天形式运行,并内置终端、审查和在编辑器中打开的工作流。

- **同时运行多个智能体**,没有上下文切换的开销
- **将每个任务隔离**在独立的 git worktree 中,智能体之间互不干扰
- **在一个地方监控所有智能体**,需要你介入时会收到通知
- **快速审查和编辑更改**,使用内置的差异查看器和编辑器
- **在任何需要的地方打开工作区**,一键交接到你的编辑器或终端
- **随时随地访问你的工作区**,通过远程主机、CLI、SDK 或 MCP

少等待,多交付。

## 功能

<table>
<tr>
<td width="50%" valign="middle">

### 并行工作区

一次运行 100+ 个编码智能体,每个都在自己的 git worktree 中,拥有独立的分支、终端和环境。比较结果,合并最优方案。

[文档 →](https://docs.paradev.com/workspaces)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude 正在流式输出一次计费迁移,其他智能体在并行工作区中运行" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 智能体监控

从侧边栏跟踪每个智能体,配有工作指示器、完成提示音,以及需要你介入时的 Dock 徽标。

[文档 →](https://docs.paradev.com/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="一个智能体完成任务,侧边栏状态从工作中切换为已完成" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 内置终端

标签页、无限分屏、预设,以及在重启后依然保留的持久会话。按 ⌘I 打开富文本提示词编辑器,支持多行编辑和 @ 文件提及。

[文档 →](https://docs.paradev.com/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="在分屏终端旁的富文本提示词编辑器中输入带 @ 文件提及的后续指令" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 内置差异查看器

无需离开应用即可检查、评论和编辑智能体的更改,准备就绪后提交并推送。

[文档 →](https://docs.paradev.com/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="在差异查看器中审查智能体的更改" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 应用内浏览器与端口

在浏览器窗格中预览正在运行的开发服务器。端口按工作区检测,每个 worktree 都有自己的预览。

[文档 →](https://docs.paradev.com/browser)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="应用内浏览器预览开发服务器并显示检测到的端口" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 自动化

按计划运行智能体会话:夜间分诊 issue、起草每周更新日志、保持依赖最新。

[文档 →](https://docs.paradev.com/automations)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="按计划运行的智能体自动化" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 远程访问

连接另一台机器,随时随地访问它的工作区:桌面应用、CLI 或手机。用自定义命令唤醒离线主机。

[文档 →](https://docs.paradev.com/remote-access)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="组织设置中的主机与成员" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paradev CLI

在任何 shell 中编写脚本:用单个二进制文件创建工作区、启动智能体、读取它们的终端、管理自动化。只要智能体能运行命令,它就能驱动 Paradev。

[文档 →](https://docs.paradev.com/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="通过 Paradev CLI 创建工作区并启动智能体" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 命令面板

在一个搜索框中跳转到任何工作区、操作或设置。

[文档 →](https://docs.paradev.com/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="在命令面板中输入并实时筛选工作区操作" width="100%" /></a>
</td>
</tr>
</table>

**开箱即用的还有:**

- **[内置技能](https://docs.paradev.com/skills)**:智能体预装 `superset:*` 技能(编排并行智能体、安排自动化、提交反馈、诊断问题),启动时自动配置
- **[模型选择器与自定义智能体](https://docs.paradev.com/agent-integration)**:启动时选择模型和推理力度,并可为任何终端智能体添加专属图标
- **[工作区设置脚本](https://docs.paradev.com/setup-teardown-scripts)**:按工作区自动化环境配置、依赖安装和开发服务器
- **[终端预设](https://docs.paradev.com/terminal-presets)**:保存智能体和 shell 布局,一键打开
- **[Slack 与 Linear](https://docs.paradev.com/use-with-linear)**:从 Slack 消息或 Linear issue 直接创建工作区
- **[在你的 IDE 中打开](https://docs.paradev.com/use-with-ide)**:一键交接到 Cursor、VS Code 或任何编辑器
- **[自定义主题](https://docs.paradev.com/custom-themes)**:构建、编辑和导入主题文件
- **[键盘快捷键](https://docs.paradev.com/keyboard-shortcuts)**:每个操作都可通过**设置 → 键盘快捷键**(⌘/)重新映射
- **[自带提供商](https://docs.paradev.com/providers)**:连接 OpenRouter、Bedrock、Vertex 或 Vercel AI Gateway
- **还有更多**:我们每天发布新版本,这份列表永远落后于实际。真正的功能列表是[更新日志](https://paradev.com/changelog)。

## 支持的智能体

Paradev 适用于任何基于 CLI 的编码智能体,包括:

| 智能体 | 状态 |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | 完全支持 |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | 完全支持 |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | 完全支持 |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | 完全支持 |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/muse-white.svg" /><img height="16" align="top" alt="Muse Code" src="../packages/ui/src/assets/icons/preset-icons/muse.svg" /></picture> &nbsp;[Muse Code](https://developer.meta.com/ai/products/muse-code/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/devin-white.svg" /><img height="16" align="top" alt="Devin" src="../packages/ui/src/assets/icons/preset-icons/devin.svg" /></picture> &nbsp;[Devin](https://devin.ai/cli) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | 完全支持 |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | 完全支持 |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | 完全支持 |
| 任何其他 CLI 智能体 | 无需配置即可使用 |

只要能在终端里运行,就能在 Paradev 上运行

智能体得到的不只是一个终端:

- **模型选择器**:启动智能体时选择模型和推理力度
- **按智能体设置**:在设置 → 智能体中调整启动命令、提示词模板和模型覆盖
- **自定义智能体**:添加任何终端智能体并配上专属图标,它就像内置的一样工作
- **状态与通知**:工作指示器、完成提示音,以及智能体需要你时的 Dock 徽标
- **内置聊天**:在聊天窗格中与模型对话,支持内联工具批准和计划审查

<details>
<summary><strong>常见问题</strong></summary>
<br />

<details>
<summary>Paradev 是终端应用还是桌面应用?</summary>
<br />

Paradev 是桌面应用,不是终端应用。智能体在其中以聊天形式或在终端中运行。旁边还有差异查看器、拉取请求、应用内浏览器和文件编辑器。[FAQ 文档](https://docs.paradev.com/faq)

</details>

<details>
<summary>我必须使用终端吗,还是可以直接和编码智能体聊天?</summary>
<br />

不必使用终端。Paradev 可以将智能体会话显示为聊天而非终端,你只需点击即可批准或拒绝智能体的操作。聊天支持 Claude Code、Codex、OpenCode 和 Pi。Paradev 运行的是你已经安装的 CLI,因此会保留你的登录状态和设置。通过 **CLI** / **Chat** 切换,可以在不丢失上下文的情况下切换正在运行的会话,其他智能体则在 Paradev 终端中运行。[聊天文档](https://docs.paradev.com/chat)

</details>

<details>
<summary>Paradev 采用什么许可证、费用如何、支持哪些平台?</summary>
<br />

Paradev 基于 MIT 许可证开源。Free 套餐支持通过桌面应用和 CLI 使用本地工作区。付费套餐增加了自动化和云工作区等功能。桌面应用可在 macOS 上运行,另有实验性的 Linux AppImage。Windows 版暂未推出。[定价](https://paradev.com/pricing) · [FAQ 文档](https://docs.paradev.com/faq)

</details>

<details>
<summary>Paradev 和 Superset 是一回事吗?它和 Apache Superset 有关系吗?</summary>
<br />

Paradev 以前名为 Superset,所以 CLI 命令仍然是 `superset`。它与商业智能工具 Apache Superset 没有关系。[安装文档](https://docs.paradev.com/install)

</details>

<details>
<summary>Paradev 支持哪些编码智能体?我能继续使用自己的订阅吗?</summary>
<br />

Paradev 内置支持 Claude Code、Codex、OpenCode、Cursor Agent、Gemini CLI、Amp 等,你还可以添加任何其他 CLI 智能体。Claude Code、Codex、OpenCode 和 Pi 还可以以聊天形式运行。智能体使用你自己的订阅和 API 密钥,Paradev 不会代理模型调用。[支持的智能体文档](https://docs.paradev.com/supported-agents)

</details>

<details>
<summary>如何防止多个编码智能体在同一个仓库中互相覆盖?</summary>
<br />

Paradev 为每个智能体提供独立的工作区:一个位于独立分支上的 Git worktree,并配有独立的终端。智能体编辑的是工作文件的不同副本,因此一个智能体不会覆盖另一个智能体的更改。worktree 不会对进程进行沙盒隔离,合并分支时仍可能出现冲突。[工作区文档](https://docs.paradev.com/workspaces)

</details>

<details>
<summary>我的 Claude Code 终端会话太多了,怎么跟踪它们?</summary>
<br />

Paradev 在同一个侧边栏中按项目分组显示所有智能体会话,无论会话以聊天形式还是在终端中运行,都会显示各自的状态。Claude Code 会在完成任务和等待你输入时报告,侧边栏会标记需要你处理的工作区。[智能体状态文档](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>我能让两个编码智能体处理同一个任务并比较结果吗?</summary>
<br />

可以。在 Paradev 中,你可以把同一个提示词交给两个或更多工作区,每个工作区都在自己的分支上,使用相同或不同的智能体。然后比较各自的差异,保留最好的结果。[智能体竞速示例](https://docs.paradev.com/recipes/race-agents)

</details>

<details>
<summary>我能同时使用 Claude Code 和 Codex,一个写代码,另一个审查吗?</summary>
<br />

可以。Paradev 可以并排运行 Claude Code 和 Codex,每个都可以以聊天形式或在终端中运行。要进行审查,可以在拉取请求的 **Code** 标签页中选中代码行并发送给另一个智能体,或者使用 **Continue with another agent**,带着最近的上下文启动另一个智能体的会话。[智能体会话文档](https://docs.paradev.com/agent-sessions)

</details>

<details>
<summary>合并前如何审查编码智能体的差异并发送后续指令?</summary>
<br />

Paradev 在差异查看器中显示每个工作区的更改,你可以在其中提交、推送并创建拉取请求。在拉取请求的 **Code** 标签页中选中代码行,即可将评论发送给正在运行的智能体或新会话。是否同时发布到 GitHub 由你决定。你还可以在同一视图中查看检查结果并合并。[拉取请求文档](https://docs.paradev.com/pull-requests)

</details>

<details>
<summary>如何让每个分支的开发服务器、端口和预览互不干扰?</summary>
<br />

Paradev 将每个分支放在各自的 worktree 中,并按工作区分组显示各工作区进程监听的端口。选择一个端口,即可在应用内浏览器中打开该分支的开发服务器。Paradev 不会分配端口范围,因此请在设置脚本中进行每个工作区的配置。设置脚本会在每个新工作区中运行,并提供 `SUPERSET_WORKSPACE_PATH` 等变量。[端口文档](https://docs.paradev.com/ports)

</details>

<details>
<summary>我能点击正在运行的 Web 应用中的元素,让编码智能体修改它吗?</summary>
<br />

可以。Paradev 的应用内浏览器提供 Design 模式:打开你的开发服务器,开启 **Design**,然后点击元素。接着描述你想要的修改,智能体会收到该元素的详细信息和一张截图,以及你的说明。[浏览器文档](https://docs.paradev.com/browser)

</details>

<details>
<summary>编码智能体需要我输入时,我能收到通知吗?</summary>
<br />

可以。智能体完成任务或停下来等待你输入时,Paradev 桌面应用会通知你,macOS Dock 图标也会显示徽标。支持情况因智能体而异:Claude Code 会报告这两种状态,有些智能体只在完成时报告。在移动应用中,工作区上的圆点表示有智能体需要你授权。推送通知暂不可用。[智能体状态文档](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>我能在 iPhone 上查看编码智能体的进展并回复它们吗?</summary>
<br />

可以。通过 iPhone 和 iPad 版 Paradev,你可以启动智能体、实时跟进会话、回复智能体并审查更改。需要 iOS 26 或 iPadOS 26 及以上版本以及 Paradev Pro,Google Play 上也提供 Android 应用。如需访问你电脑上的工作区,请开启远程访问,并让电脑保持唤醒和联网。[移动应用文档](https://docs.paradev.com/mobile)

</details>

<details>
<summary>编码智能体能按计划运行吗,比如每晚维护或每周检查不稳定的测试?</summary>
<br />

可以。Paradev 自动化可以按每小时、每天、每周或自定义计划运行智能体。每次运行都会创建一个工作区,你可以在其中审查更改并继续工作。自动化需要 Pro 套餐。[自动化文档](https://docs.paradev.com/automations)

</details>

<details>
<summary>我能从 Slack、Linear、Sentry 或 GitHub 拉取请求启动编码智能体吗?</summary>
<br />

可以。当收到 GitHub 拉取请求事件、Slack 消息、Linear issue、Sentry issue 或 webhook 时,Paradev 自动化会启动智能体,智能体会连同你的提示词一起收到事件详情。你还可以在 Slack 中提及 Paradev 机器人,来启动云工作区和智能体。自动化和 Slack 集成需要 Pro 套餐。[自动化文档](https://docs.paradev.com/automations)

</details>

<details>
<summary>我能从命令行或另一个智能体启动编码智能体吗?</summary>
<br />

可以。Paradev CLI 可以从 shell 脚本或另一个智能体创建工作区,并在其中启动智能体。智能体也可以通过 Paradev MCP 服务器操作工作区和终端。桌面应用包含一个 orchestrate 技能,可让一个智能体协调位于不同工作区中的多个工作智能体。[CLI 文档](https://docs.paradev.com/cli/getting-started)

</details>

<details>
<summary>我能在远程机器或云端运行编码智能体,并在笔记本电脑上审查更改吗?</summary>
<br />

可以。借助 Paradev 远程访问(Pro 套餐),你可以在笔记本电脑上打开托管在另一台机器(例如 Mac mini 或服务器)上的工作区。云工作区(Team 和 Ultra 套餐)让每个工作区运行在各自的云端机器上,因此合上笔记本电脑后,智能体仍会继续工作。[远程访问文档](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>我能稍后再回到某个任务,并且它的智能体会话和分支都还在吗?</summary>
<br />

可以。Paradev 工作区会作为其分支上的 Git worktree 保留在磁盘上,直到你删除它。终端归属于一个后台进程,因此关闭或更新应用时,终端会继续运行并保留滚动历史。如果终端因崩溃或重启而停止,对于支持恢复的智能体(例如 Claude Code 和 Codex),Paradev 可以恢复其智能体会话。[保持智能体运行文档](https://docs.paradev.com/keep-agents-running)

</details>

<details>
<summary>小团队能共用一台机器来运行编码智能体吗?</summary>
<br />

可以。Paradev 主机可以是一台共享机器(例如 Mac mini),团队成员通过远程访问(Pro 套餐)连接。主机首次上线时,只有启动它的人拥有访问权限。之后由此人在 **Settings → Hosts** 中添加团队成员。[远程访问文档](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Paradev 与 Conductor、Orca 和 Cursor 有什么不同?</summary>
<br />

Paradev、Conductor 和 Orca 都在并行的 Git worktree 中运行编码智能体,而 Cursor 是围绕自家智能体构建的 AI 编辑器。Paradev 使用你自己的订阅运行任何 CLI 智能体,想在 Cursor 中编辑时,也可以直接在 Cursor 中打开工作区。Orca 同样开源,并且支持 Windows,而 Paradev 暂不支持 Windows。Conductor 即将加入 Meta,已不再接受新用户,Paradev 提供了将 Conductor 工作区迁移过来的指南。[从 Conductor 迁移](https://docs.paradev.com/migrate-from-conductor)

</details>

<details>
<summary>Paradev 能替代 tmux 吗?</summary>
<br />

可以。就运行编码智能体而言,Paradev 可以替代 tmux:关闭、退出或更新应用时,它的终端会话会继续运行。每个工作区还有自己的 worktree,并在侧边栏中显示状态。你仍然可以在 Paradev 终端中运行 tmux。[保持智能体运行文档](https://docs.paradev.com/keep-agents-running)

</details>

</details>

## 不只是一个桌面应用

每个界面都连接到同样的工作区,你可以在应用里开始一个任务,然后在任何地方查看进展。

| 界面 | 你能得到什么 |
|:--------|:-------------|
| [**桌面应用**](https://github.com/paradevai/paradev/releases/latest) | 完整的 IDE:终端、差异查看器、应用内浏览器、自动化 |
| [**CLI**](https://docs.paradev.com/cli/getting-started) | 单个 `superset` 二进制文件,在任何 shell 中管理工作区、智能体、终端和主机 |
| [**TypeScript SDK**](https://docs.paradev.com/sdk/getting-started) | 通过 [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) 在 Node、Bun 或 Deno 中以编程方式驱动 Paradev |
| [**MCP 服务器**](https://docs.paradev.com/mcp) | 让 Claude Code、Codex、Cursor 等智能体自己创建和管理工作区 |

CLI 随桌面应用一起提供,也可以独立安装:

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
# or
brew install paradevai/tap/superset
```

iOS 应用即将推出,让你可以在手机上查看你的智能体。

## 安装

下载桌面应用:

- **macOS**:[Apple Silicon (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-x64.dmg)
- **Linux**:[x64 AppImage](https://github.com/paradevai/paradev/releases/latest/download/Paradev-x86_64.AppImage)(实验性;macOS 是主要目标平台)
- **Windows**:暂不可用
- [所有构建版本](https://github.com/paradevai/paradev/releases/latest)

你只需要安装 [Git](https://git-scm.com/)。[gh](https://cli.github.com/) 是可选的,用于解锁 PR 工作流;Paradev 会主动提议为你安装。

## 开发

想折腾 Paradev 或贡献一个 PR?克隆仓库,把它添加到已安装的 Paradev 应用中,然后为你的更改创建一个工作区:

```bash
git clone https://github.com/paradevai/paradev.git
```

然后在该工作区的终端中运行开发环境设置:

```bash
./.paradev/setup.local.sh
bun run dev
```

在每个新 worktree 中运行一次 `setup.local.sh`。它会配置工作区专属的应用标识和端口,让开发版桌面应用可以与已安装的 Paradev 应用及其他开发 worktree 并行运行。

无需 Neon 账号或第三方凭据。`setup.local.sh` 会通过 Docker 启动本地 Postgres + Electric 栈并植入一个开发账号。用 **"Sign in as dev"** 按钮(或 `admin@local.test` / `supersetdev`)登录即可。

前置条件:[Bun](https://bun.sh/) v1.4.3+(固定在 `.bun-version` 中)、`docker`、`jq` 和 `caddy`,`bun dev` 会将 `caddy` 作为本地 HTTPS 代理运行(`brew install jq caddy && caddy trust`)。

完整指南见 [**DEVELOPMENT.md**](../DEVELOPMENT.md):设置脚本做了什么、针对真实服务的手动设置、常用命令、故障排查,以及如何构建桌面应用。贡献流程见 [**CONTRIBUTING.md**](../CONTRIBUTING.md)。

## 配置

在 `.paradev/config.json` 中配置工作区的设置、清理和运行脚本。参见[完整文档](https://docs.paradev.com/setup-teardown-scripts)。

```json
{
  "setup": ["./.paradev/setup.sh"],
  "teardown": ["./.paradev/teardown.sh"],
  "run": ["./.paradev/run.sh"]
}
```

键盘快捷键可通过**设置 → 键盘快捷键**(⌘/)自定义;参见[完整快捷键列表](https://docs.paradev.com/keyboard-shortcuts)。

## 技术栈

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

## 默认私密

- **显式连接**:由你决定连接哪些智能体、提供商和集成。

## 贡献

我们欢迎贡献!参见 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何搭建环境并提交 PR。Bug 和功能请求请提交到 [issues](https://github.com/paradevai/paradev/issues)。

<a href="https://github.com/paradevai/paradev/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paradevai/paradev" />
</a>

## 社区

加入 Paradev 社区,获取帮助、分享反馈,并与其他用户交流:

- **[Discord](https://discord.gg/cZeD9WYcV7)**:与团队和社区聊天
- **[Twitter](https://x.com/paradevai)**:关注以获取更新和公告
- **[GitHub Issues](https://github.com/paradevai/paradev/issues)**:报告 bug 和请求功能
- **[GitHub Discussions](https://github.com/paradevai/paradev/discussions)**:提问和分享想法

### 团队

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## 许可与永久免费的部分

**桌面应用永久免费。**在你自己的机器上并行运行智能体永远不需要付费。我们收费的任何东西都会是在此之上的可选服务。

整个应用都在这个仓库中,采用 [MIT 许可证](../LICENSE.md):使用它、fork 它、修改它、自托管它、再分发它,都可以。
