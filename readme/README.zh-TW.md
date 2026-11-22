<div align="center">

<img width="full" alt="Claude 與 OpenCode 在平行的 Paradev 工作區中工作並即時顯示差異" src="../apps/marketing/public/images/readme-hero.gif" />

### 平行執行 100+ 個編碼代理程式

<details>
<summary>🌐 其他語言版本</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*本文件為英文版 README 的翻譯,內容以英文版為準。*

[![GitHub stars](https://img.shields.io/github/stars/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@paradevai-555?logo=x)](https://x.com/paradevai)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code、Codex 或任何 CLI 代理程式,各自執行在獨立的 worktree 中。<br />
把時間花在交付上,而不是等待上。

<br />

[**下載 macOS 版**](https://github.com/paradevai/paradev/releases/latest) &nbsp;&bull;&nbsp; [文件](https://docs.paradev.com) &nbsp;&bull;&nbsp; [更新日誌](https://github.com/paradevai/paradev/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## 零切換成本,寫程式快 10 倍

Paradev 在相互隔離的 git worktree 中平行執行以 CLI 為基礎的編碼代理程式,在終端中或以聊天形式執行,並內建終端、審查以及在編輯器中開啟的工作流程。

- **同時執行多個代理程式**,沒有情境切換的負擔
- **將每項任務隔離**在獨立的 git worktree 中,代理程式之間互不干擾
- **在同一個地方監控所有代理程式**,需要你介入時會收到通知
- **快速審查與編輯變更**,使用內建的差異檢視器和編輯器
- **在任何需要的地方開啟工作區**,一鍵交接到你的編輯器或終端
- **隨時隨地存取你的工作區**,透過遠端主機、CLI、SDK 或 MCP

少等待,多交付。

## 功能

<table>
<tr>
<td width="50%" valign="middle">

### 平行工作區

一次執行 100+ 個編碼代理程式,每個都在自己的 git worktree 中,擁有獨立的分支、終端和環境。比較結果,合併最佳方案。

[文件 →](https://docs.paradev.com/workspaces)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude 正在串流輸出一次計費系統遷移,其他代理程式在平行工作區中執行" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 代理程式監控

從側邊欄追蹤每個代理程式,搭配工作指示器、完成提示音,以及需要你介入時的 Dock 徽章。

[文件 →](https://docs.paradev.com/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="一個代理程式完成任務,側邊欄狀態從工作中切換為已完成" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 內建終端

分頁、無限分割、預設,以及重新啟動後依然保留的持續性工作階段。按 ⌘I 開啟富文字提示編輯器,支援多行編輯和 @ 檔案提及。

[文件 →](https://docs.paradev.com/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="在分割終端旁的富文字提示編輯器中輸入帶 @ 檔案提及的後續指令" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 內建差異檢視器

不必離開應用程式即可檢視、評論和編輯代理程式的變更,準備就緒後提交並推送。

[文件 →](https://docs.paradev.com/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="在差異檢視器中審查代理程式的變更" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 應用程式內瀏覽器與連接埠

在瀏覽器窗格中預覽正在執行的開發伺服器。連接埠依工作區偵測,每個 worktree 都有自己的預覽。

[文件 →](https://docs.paradev.com/browser)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="應用程式內瀏覽器預覽開發伺服器並顯示偵測到的連接埠" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 自動化

依排程執行代理程式工作階段:夜間分類 issue、草擬每週更新日誌、讓相依套件保持最新。

[文件 →](https://docs.paradev.com/automations)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="依排程執行的代理程式自動化" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 遠端存取

連接另一台機器,隨時隨地存取它的工作區:桌面應用程式、CLI 或手機。用自訂命令喚醒離線主機。

[文件 →](https://docs.paradev.com/remote-access)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="組織設定中的主機與成員" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paradev CLI

在任何 shell 中撰寫指令碼:用單一執行檔建立工作區、啟動代理程式、讀取它們的終端、管理自動化。只要代理程式能執行命令,它就能操作 Paradev。

[文件 →](https://docs.paradev.com/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="透過 Paradev CLI 建立工作區並啟動代理程式" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 命令面板

在同一個搜尋框中跳轉到任何工作區、動作或設定。

[文件 →](https://docs.paradev.com/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="在命令面板中輸入並即時篩選工作區動作" width="100%" /></a>
</td>
</tr>
</table>

**隨附的還有:**

- **[內建技能](https://docs.paradev.com/skills)**:代理程式預載 `superset:*` 技能(協調平行代理程式、排程自動化、回報意見、診斷問題),啟動時自動佈建
- **[模型選擇器與自訂代理程式](https://docs.paradev.com/agent-integration)**:啟動時選擇模型和推理力度,並可為任何終端代理程式加上專屬圖示
- **[工作區設定指令碼](https://docs.paradev.com/setup-teardown-scripts)**:依工作區自動化環境設定、相依套件安裝和開發伺服器
- **[終端預設](https://docs.paradev.com/terminal-presets)**:儲存代理程式和 shell 版面配置,一鍵開啟
- **[Slack 與 Linear](https://docs.paradev.com/use-with-linear)**:從 Slack 訊息或 Linear issue 直接建立工作區
- **[在你的 IDE 中開啟](https://docs.paradev.com/use-with-ide)**:一鍵交接到 Cursor、VS Code 或任何編輯器
- **[自訂佈景主題](https://docs.paradev.com/custom-themes)**:建立、編輯和匯入佈景主題檔案
- **[鍵盤快速鍵](https://docs.paradev.com/keyboard-shortcuts)**:每個動作都可透過**設定 → 鍵盤快速鍵**(⌘/)重新對應
- **[自帶供應商](https://docs.paradev.com/providers)**:連接 OpenRouter、Bedrock、Vertex 或 Vercel AI Gateway
- **還有更多**:我們每天出貨,這份清單永遠落後於實際。真正的功能清單是[更新日誌](https://paradev.com/changelog)。

## 支援的代理程式

Paradev 適用於任何以 CLI 為基礎的編碼代理程式,包括:

| 代理程式 | 狀態 |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | 完整支援 |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | 完整支援 |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | 完整支援 |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | 完整支援 |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/muse-white.svg" /><img height="16" align="top" alt="Muse Code" src="../packages/ui/src/assets/icons/preset-icons/muse.svg" /></picture> &nbsp;[Muse Code](https://developer.meta.com/ai/products/muse-code/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/devin-white.svg" /><img height="16" align="top" alt="Devin" src="../packages/ui/src/assets/icons/preset-icons/devin.svg" /></picture> &nbsp;[Devin](https://devin.ai/cli) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | 完整支援 |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | 完整支援 |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | 完整支援 |
| 任何其他 CLI 代理程式 | 無需設定即可使用 |

只要能在終端裡執行,就能在 Paradev 上執行

代理程式得到的不只是一個終端:

- **模型選擇器**:啟動代理程式時選擇模型和推理力度
- **依代理程式設定**:在設定 → 代理程式中調整啟動命令、提示範本和模型覆寫
- **自訂代理程式**:加入任何終端代理程式並配上專屬圖示,它就和內建的一樣運作
- **狀態與通知**:工作指示器、完成提示音,以及代理程式需要你時的 Dock 徽章
- **內建聊天**:在聊天窗格中與模型對話,支援內嵌工具核准和計畫審查

<details>
<summary><strong>常見問題</strong></summary>
<br />

<details>
<summary>Paradev 是終端應用程式還是桌面應用程式?</summary>
<br />

Paradev 是桌面應用程式,不是終端應用程式。代理程式在其中以聊天形式或在終端中執行。旁邊還有差異檢視器、拉取請求、應用程式內瀏覽器和檔案編輯器。[FAQ 文件](https://docs.paradev.com/faq)

</details>

<details>
<summary>我一定要使用終端嗎,還是可以直接和編碼代理程式聊天?</summary>
<br />

不一定要使用終端。Paradev 可以將代理程式工作階段顯示為聊天而非終端,你只要點一下就能核准或拒絕代理程式的操作。聊天支援 Claude Code、Codex、OpenCode 和 Pi。Paradev 執行的是你已經安裝的 CLI,因此會保留你的登入狀態和設定。透過 **CLI** / **Chat** 切換,可以在不遺失上下文的情況下切換正在執行的工作階段,其他代理程式則在 Paradev 終端中執行。[聊天文件](https://docs.paradev.com/chat)

</details>

<details>
<summary>Paradev 採用什麼授權、費用多少、支援哪些平台?</summary>
<br />

Paradev 以 MIT 授權開源。Free 方案可透過桌面應用程式和 CLI 使用本機工作區。付費方案則加入自動化和雲端工作區等功能。桌面應用程式可在 macOS 上執行,另有實驗性的 Linux AppImage。Windows 版尚未推出。[定價](https://paradev.com/pricing) · [FAQ 文件](https://docs.paradev.com/faq)

</details>

<details>
<summary>Paradev 和 Superset 是同一個產品嗎?它和 Apache Superset 有關係嗎?</summary>
<br />

Paradev 以前名為 Superset,所以 CLI 指令仍然是 `superset`。它與商業智慧工具 Apache Superset 沒有關係。[安裝文件](https://docs.paradev.com/install)

</details>

<details>
<summary>Paradev 支援哪些編碼代理程式?我能繼續使用自己的訂閱嗎?</summary>
<br />

Paradev 內建支援 Claude Code、Codex、OpenCode、Cursor Agent、Gemini CLI、Amp 等,你也可以加入任何其他 CLI 代理程式。Claude Code、Codex、OpenCode 和 Pi 也能以聊天形式執行。代理程式使用你自己的訂閱和 API 金鑰,Paradev 不會代理模型呼叫。[支援的代理程式文件](https://docs.paradev.com/supported-agents)

</details>

<details>
<summary>如何避免多個編碼代理程式在同一個儲存庫中互相覆寫?</summary>
<br />

Paradev 為每個代理程式提供獨立的工作區:一個位於獨立分支上的 Git worktree,並配有獨立的終端。代理程式編輯的是工作檔案的不同副本,因此一個代理程式不會覆寫另一個代理程式的變更。worktree 不會對程序進行沙箱隔離,合併分支時仍可能發生衝突。[工作區文件](https://docs.paradev.com/workspaces)

</details>

<details>
<summary>我的 Claude Code 終端工作階段太多了,要怎麼追蹤?</summary>
<br />

Paradev 在同一個側邊欄中依專案分組顯示所有代理程式工作階段,無論工作階段以聊天形式還是在終端中執行,都會顯示各自的狀態。Claude Code 會在完成任務和等待你輸入時回報,側邊欄會標示需要你處理的工作區。[代理程式狀態文件](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>我能讓兩個編碼代理程式處理同一項任務並比較結果嗎?</summary>
<br />

可以。在 Paradev 中,你可以把同一個提示交給兩個以上的工作區,每個工作區都在自己的分支上,使用相同或不同的代理程式。接著比較各自的差異,保留最好的結果。[代理程式競速範例](https://docs.paradev.com/recipes/race-agents)

</details>

<details>
<summary>我能同時使用 Claude Code 和 Codex,一個寫程式碼,另一個審查嗎?</summary>
<br />

可以。Paradev 可以並排執行 Claude Code 和 Codex,兩者都能以聊天形式或在終端中執行。若要進行審查,可以在拉取請求的 **Code** 分頁中選取程式碼行並傳送給另一個代理程式,或使用 **Continue with another agent**,帶著最近的上下文啟動另一個代理程式的工作階段。[代理程式工作階段文件](https://docs.paradev.com/agent-sessions)

</details>

<details>
<summary>合併前要如何審查編碼代理程式的差異並傳送後續指示?</summary>
<br />

Paradev 在差異檢視器中顯示每個工作區的變更,你可以在其中提交、推送並建立拉取請求。在拉取請求的 **Code** 分頁中選取程式碼行,即可將評論傳送給正在執行的代理程式或新的工作階段。是否同時發佈到 GitHub 由你決定。你也可以在同一個檢視中查看檢查結果並合併。[拉取請求文件](https://docs.paradev.com/pull-requests)

</details>

<details>
<summary>如何讓每個分支的開發伺服器、連接埠和預覽互不干擾?</summary>
<br />

Paradev 將每個分支放在各自的 worktree 中,並依工作區分組顯示各工作區程序所監聽的連接埠。選取一個連接埠,即可在應用程式內瀏覽器中開啟該分支的開發伺服器。Paradev 不會分配連接埠範圍,因此請在設定指令碼中進行各工作區的設定。設定指令碼會在每個新工作區中執行,並提供 `SUPERSET_WORKSPACE_PATH` 等變數。[連接埠文件](https://docs.paradev.com/ports)

</details>

<details>
<summary>我能點選正在執行的 Web 應用程式中的元素,讓編碼代理程式修改它嗎?</summary>
<br />

可以。Paradev 的應用程式內瀏覽器提供 Design 模式:開啟你的開發伺服器,開啟 **Design**,然後點選元素。接著描述你想要的修改,代理程式會收到該元素的詳細資訊和一張螢幕截圖,以及你的說明。[瀏覽器文件](https://docs.paradev.com/browser)

</details>

<details>
<summary>編碼代理程式需要我輸入時,我能收到通知嗎?</summary>
<br />

可以。代理程式完成任務或停下來等待你輸入時,Paradev 桌面應用程式會通知你,macOS Dock 圖示也會顯示徽章。支援程度依代理程式而異:Claude Code 會回報這兩種狀態,有些代理程式只在完成時回報。在行動應用程式中,工作區上的圓點表示有代理程式需要你的授權。推播通知尚未推出。[代理程式狀態文件](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>我能在 iPhone 上查看編碼代理程式的進度並回覆它們嗎?</summary>
<br />

可以。透過 iPhone 和 iPad 版 Paradev,你可以啟動代理程式、即時追蹤工作階段、回覆代理程式並審查變更。需要 iOS 26 或 iPadOS 26 以上版本以及 Paradev Pro,Google Play 上也提供 Android 應用程式。若要存取你電腦上的工作區,請開啟遠端存取,並讓電腦保持喚醒和連線狀態。[行動應用程式文件](https://docs.paradev.com/mobile)

</details>

<details>
<summary>編碼代理程式能依排程執行嗎,例如每晚維護或每週檢查不穩定的測試?</summary>
<br />

可以。Paradev 自動化可以依每小時、每天、每週或自訂排程執行代理程式。每次執行都會建立一個工作區,你可以在其中審查變更並繼續工作。自動化需要 Pro 方案。[自動化文件](https://docs.paradev.com/automations)

</details>

<details>
<summary>我能從 Slack、Linear、Sentry 或 GitHub 拉取請求啟動編碼代理程式嗎?</summary>
<br />

可以。收到 GitHub 拉取請求事件、Slack 訊息、Linear issue、Sentry issue 或 webhook 時,Paradev 自動化會啟動代理程式,代理程式會連同你的提示一起收到事件詳細資訊。你也可以在 Slack 中提及 Paradev 機器人,來啟動雲端工作區和代理程式。自動化和 Slack 整合需要 Pro 方案。[自動化文件](https://docs.paradev.com/automations)

</details>

<details>
<summary>我能從命令列或另一個代理程式啟動編碼代理程式嗎?</summary>
<br />

可以。Paradev CLI 可以從 shell 指令碼或另一個代理程式建立工作區,並在其中啟動代理程式。代理程式也可以透過 Paradev MCP 伺服器操作工作區和終端。桌面應用程式內含 orchestrate 技能,可讓一個代理程式協調位於不同工作區中的多個工作代理程式。[CLI 文件](https://docs.paradev.com/cli/getting-started)

</details>

<details>
<summary>我能在遠端機器或雲端執行編碼代理程式,並在筆電上審查變更嗎?</summary>
<br />

可以。透過 Paradev 遠端存取(Pro 方案),你可以在筆電上開啟託管在另一台機器(例如 Mac mini 或伺服器)上的工作區。雲端工作區(Team 和 Ultra 方案)會讓每個工作區在各自的雲端機器上執行,因此闔上筆電後,代理程式仍會繼續工作。[遠端存取文件](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>我能晚點再回到某項任務,而它的代理程式工作階段和分支都還在嗎?</summary>
<br />

可以。Paradev 工作區會以其分支上的 Git worktree 形式保留在磁碟上,直到你刪除為止。終端隸屬於一個背景程序,因此關閉或更新應用程式時,終端會繼續執行並保留捲動記錄。如果終端因當機或重新啟動而停止,對於支援恢復的代理程式(例如 Claude Code 和 Codex),Paradev 可以恢復其代理程式工作階段。[讓代理程式持續執行文件](https://docs.paradev.com/keep-agents-running)

</details>

<details>
<summary>小團隊能共用一台機器來執行編碼代理程式嗎?</summary>
<br />

可以。Paradev 主機可以是一台共用機器(例如 Mac mini),團隊成員透過遠端存取(Pro 方案)連線。主機第一次上線時,只有啟動它的人擁有存取權限。之後由這個人在 **Settings → Hosts** 中加入團隊成員。[遠端存取文件](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Paradev 與 Conductor、Orca 和 Cursor 有什麼不同?</summary>
<br />

Paradev、Conductor 和 Orca 都在平行的 Git worktree 中執行編碼代理程式,而 Cursor 是圍繞自家代理程式打造的 AI 編輯器。Paradev 使用你自己的訂閱執行任何 CLI 代理程式,想在 Cursor 中編輯時,也可以直接在 Cursor 中開啟工作區。Orca 同樣開源,並且支援 Windows,而 Paradev 尚未支援 Windows。Conductor 即將加入 Meta,已不再接受新使用者,Paradev 提供了將 Conductor 工作區遷移過來的指南。[從 Conductor 遷移](https://docs.paradev.com/migrate-from-conductor)

</details>

<details>
<summary>Paradev 能取代 tmux 嗎?</summary>
<br />

可以。就執行編碼代理程式而言,Paradev 可以取代 tmux:關閉、結束或更新應用程式時,它的終端工作階段會繼續執行。每個工作區也有自己的 worktree,並在側邊欄中顯示狀態。你仍然可以在 Paradev 終端中執行 tmux。[讓代理程式持續執行文件](https://docs.paradev.com/keep-agents-running)

</details>

</details>

## 不只是一個桌面應用程式

每個介面都連接到同樣的工作區,你可以在應用程式中開始一項任務,然後在任何地方查看進度。

| 介面 | 你能得到什麼 |
|:--------|:-------------|
| [**桌面應用程式**](https://github.com/paradevai/paradev/releases/latest) | 完整的 IDE:終端、差異檢視器、應用程式內瀏覽器、自動化 |
| [**CLI**](https://docs.paradev.com/cli/getting-started) | 單一 `superset` 執行檔,在任何 shell 中管理工作區、代理程式、終端和主機 |
| [**TypeScript SDK**](https://docs.paradev.com/sdk/getting-started) | 透過 [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) 在 Node、Bun 或 Deno 中以程式方式操作 Paradev |
| [**MCP 伺服器**](https://docs.paradev.com/mcp) | 讓 Claude Code、Codex、Cursor 等代理程式自己建立和管理工作區 |

CLI 隨桌面應用程式一起提供,也可以獨立安裝:

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
# or
brew install paradevai/tap/superset
```

iOS 應用程式即將推出,讓你可以在手機上查看你的代理程式。

## 安裝

下載桌面應用程式:

- **macOS**:[Apple Silicon (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-x64.dmg)
- **Linux**:[x64 AppImage](https://github.com/paradevai/paradev/releases/latest/download/Paradev-x86_64.AppImage)(實驗性;macOS 是主要目標平台)
- **Windows**:暫不提供
- [所有建置版本](https://github.com/paradevai/paradev/releases/latest)

你只需要安裝 [Git](https://git-scm.com/)。[gh](https://cli.github.com/) 是選用的,可解鎖 PR 工作流程;Paradev 會主動提議為你安裝。

## 開發

想研究 Paradev 或貢獻一個 PR?複製儲存庫,把它加入已安裝的 Paradev 應用程式,然後為你的變更建立一個工作區:

```bash
git clone https://github.com/paradevai/paradev.git
```

然後在該工作區的終端中執行開發環境設定:

```bash
./.paradev/setup.local.sh
bun run dev
```

在每個新的 worktree 中執行一次 `setup.local.sh`。它會設定工作區專屬的應用程式識別與連接埠,讓開發版桌面應用程式可以與已安裝的 Paradev 應用程式及其他開發 worktree 並行執行。

不需要 Neon 帳號或第三方憑證。`setup.local.sh` 會透過 Docker 啟動本機 Postgres + Electric 堆疊並植入一個開發帳號。用 **「Sign in as dev」**按鈕(或 `admin@local.test` / `supersetdev`)登入即可。

先決條件:[Bun](https://bun.sh/) v1.4.3+(固定在 `.bun-version` 中)、`docker`、`jq` 和 `caddy`,`bun dev` 會將 `caddy` 作為本機 HTTPS 代理伺服器執行(`brew install jq caddy && caddy trust`)。

完整指南見 [**DEVELOPMENT.md**](../DEVELOPMENT.md):設定指令碼做了什麼、針對真實服務的手動設定、常用命令、疑難排解,以及如何建置桌面應用程式。貢獻流程見 [**CONTRIBUTING.md**](../CONTRIBUTING.md)。

## 組態

在 `.paradev/config.json` 中設定工作區的設定、清理和執行指令碼。參見[完整文件](https://docs.paradev.com/setup-teardown-scripts)。

```json
{
  "setup": ["./.paradev/setup.sh"],
  "teardown": ["./.paradev/teardown.sh"],
  "run": ["./.paradev/run.sh"]
}
```

鍵盤快速鍵可透過**設定 → 鍵盤快速鍵**(⌘/)自訂;參見[完整快速鍵清單](https://docs.paradev.com/keyboard-shortcuts)。

## 技術堆疊

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

## 預設保持私密

- **明確連接**:由你決定要連接哪些代理程式、供應商和整合。

## 貢獻

我們歡迎貢獻!參見 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何建置環境並提交 PR。Bug 和功能請求請提交到 [issues](https://github.com/paradevai/paradev/issues)。

<a href="https://github.com/paradevai/paradev/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paradevai/paradev" />
</a>

## 社群

加入 Paradev 社群,取得協助、分享意見,並與其他使用者交流:

- **[Discord](https://discord.gg/cZeD9WYcV7)**:與團隊和社群聊天
- **[Twitter](https://x.com/paradevai)**:追蹤以取得更新和公告
- **[GitHub Issues](https://github.com/paradevai/paradev/issues)**:回報 bug 和請求功能
- **[GitHub Discussions](https://github.com/paradevai/paradev/discussions)**:提問和分享想法

### 團隊

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## 授權與永久免費的部分

**桌面應用程式永久免費。**在你自己的機器上平行執行代理程式永遠不需要付費。我們若收費,也會是建立在其上的選用服務。

整個應用程式都在這個儲存庫中,採用 [MIT 授權條款](../LICENSE.md):使用它、fork 它、修改它、自行架設、再散布,都可以。
