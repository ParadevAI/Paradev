<div align="center">

<img width="full" alt="병렬 Paradev 워크스페이스에서 실시간 차이를 보여주며 작업 중인 Claude와 OpenCode" src="../apps/marketing/public/images/readme-hero.gif" />

### 100개 이상의 코딩 에이전트를 병렬로 실행

<details>
<summary>🌐 다른 언어로 보기</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*이 문서는 영어 README의 번역본이며, 영어 원문이 우선합니다.*

[![GitHub stars](https://img.shields.io/github/stars/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/paradevai/paradev?style=flat&logo=github)](https://github.com/paradevai/paradev/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@paradevai-555?logo=x)](https://x.com/paradevai)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code, Codex를 비롯한 모든 CLI 에이전트를 각각 격리된 worktree에서 실행하세요.<br />
기다리는 대신 출시하는 데 시간을 쓰세요.

<br />

[**macOS용 다운로드**](https://github.com/paradevai/paradev/releases/latest) &nbsp;&bull;&nbsp; [문서](https://docs.paradev.com) &nbsp;&bull;&nbsp; [변경 로그](https://github.com/paradevai/paradev/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## 전환 비용 없이 10배 빠른 코딩

Paradev는 CLI 기반 코딩 에이전트를 격리된 git worktree에서 병렬로, 터미널 또는 채팅으로 실행하며, 터미널, 리뷰, 에디터로 열기 워크플로를 기본 제공합니다.

- **여러 에이전트를 동시에 실행** — 컨텍스트 전환 부담이 없습니다
- **각 작업을 격리된 git worktree에 분리** — 에이전트끼리 서로 간섭하지 않습니다
- **모든 에이전트를 한곳에서 모니터링** — 개입이 필요하면 알림을 받습니다
- **변경 사항을 빠르게 리뷰하고 편집** — 내장 차이 뷰어와 에디터로
- **필요한 곳 어디서든 워크스페이스 열기** — 클릭 한 번으로 에디터나 터미널에 인계
- **어디서나 워크스페이스에 접근** — 원격 호스트, CLI, SDK, MCP를 통해

덜 기다리고, 더 많이 출시하세요.

## 기능

<table>
<tr>
<td width="50%" valign="middle">

### 병렬 워크스페이스

100개 이상의 코딩 에이전트를 한 번에 실행하세요. 각자 자기만의 브랜치, 터미널, 환경을 갖춘 git worktree에서 동작합니다. 결과를 비교하고 가장 좋은 것을 머지하세요.

[문서 →](https://docs.paradev.com/workspaces)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="다른 에이전트들이 병렬 워크스페이스에서 실행되는 동안 결제 마이그레이션을 스트리밍하는 Claude" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 에이전트 모니터링

사이드바에서 모든 에이전트를 추적하세요. 작업 중 표시, 완료 알림음, 그리고 개입이 필요할 때의 Dock 배지를 제공합니다.

[문서 →](https://docs.paradev.com/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="에이전트가 작업을 마치고 사이드바 상태가 작업 중에서 완료로 바뀌는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 내장 터미널

탭, 무제한 분할, 프리셋, 재시작 후에도 유지되는 지속 세션. ⌘I를 누르면 여러 줄 편집과 @ 파일 멘션을 지원하는 리치 프롬프트 에디터가 열립니다.

[문서 →](https://docs.paradev.com/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="분할 터미널 옆의 리치 프롬프트 에디터에서 @ 파일 멘션과 함께 후속 지시를 입력하는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 내장 차이 뷰어

앱을 벗어나지 않고 에이전트의 변경 사항을 검토하고, 코멘트를 달고, 편집한 다음, 준비되면 커밋하고 푸시하세요.

[문서 →](https://docs.paradev.com/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="차이 뷰어에서 에이전트의 변경 사항을 리뷰하는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 앱 내 브라우저와 포트

실행 중인 개발 서버를 브라우저 패널에서 미리 보세요. 포트는 워크스페이스별로 감지되므로 모든 worktree가 자기만의 미리보기를 갖습니다.

[문서 →](https://docs.paradev.com/browser)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="감지된 포트로 개발 서버를 미리 보는 앱 내 브라우저" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 자동화

에이전트 세션을 일정에 따라 실행하세요: 밤사이 이슈 분류, 주간 변경 로그 초안 작성, 의존성 최신 상태 유지.

[문서 →](https://docs.paradev.com/automations)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="일정에 따라 실행되는 에이전트 자동화" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 원격 액세스

다른 컴퓨터를 연결하고 그 워크스페이스에 어디서든 접근하세요: 데스크톱 앱, CLI, 휴대폰으로. 오프라인 호스트는 사용자 지정 명령으로 깨울 수 있습니다.

[문서 →](https://docs.paradev.com/remote-access)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="조직 설정의 호스트와 멤버" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Paradev CLI

어떤 셸에서든 스크립트로 제어하세요: 단일 바이너리로 워크스페이스 생성, 에이전트 실행, 터미널 읽기, 자동화 관리까지. 명령을 실행할 수 있는 에이전트라면 Paradev를 조종할 수 있습니다.

[문서 →](https://docs.paradev.com/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Paradev CLI에서 워크스페이스를 만들고 에이전트를 실행하는 모습" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 명령 팔레트

하나의 검색창에서 어떤 워크스페이스, 동작, 설정으로든 이동하세요.

[문서 →](https://docs.paradev.com/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.paradev.com/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="명령 팔레트에 입력하며 워크스페이스 동작을 실시간으로 필터링하는 모습" width="100%" /></a>
</td>
</tr>
</table>

**이 밖에도 기본 제공:**

- **[내장 스킬](https://docs.paradev.com/skills)**: 에이전트에는 `superset:*` 스킬(병렬 에이전트 오케스트레이션, 자동화 예약, 피드백 제출, 문제 진단)이 실행 시 자동으로 프로비저닝됩니다
- **[모델 선택기와 커스텀 에이전트](https://docs.paradev.com/agent-integration)**: 실행 시 모델과 추론 강도를 선택하고, 어떤 터미널 에이전트든 전용 아이콘과 함께 추가할 수 있습니다
- **[워크스페이스 설정 스크립트](https://docs.paradev.com/setup-teardown-scripts)**: 환경 설정, 의존성 설치, 개발 서버를 워크스페이스별로 자동화
- **[터미널 프리셋](https://docs.paradev.com/terminal-presets)**: 에이전트와 셸 레이아웃을 저장하고 키 하나로 열기
- **[Slack & Linear](https://docs.paradev.com/use-with-linear)**: Slack 메시지나 Linear 이슈에서 곧바로 워크스페이스 생성
- **[IDE에서 열기](https://docs.paradev.com/use-with-ide)**: Cursor, VS Code 등 어떤 에디터로든 클릭 한 번에 인계
- **[커스텀 테마](https://docs.paradev.com/custom-themes)**: 테마 파일을 만들고, 편집하고, 가져오기
- **[키보드 단축키](https://docs.paradev.com/keyboard-shortcuts)**: 모든 동작은 **설정 → 키보드 단축키**(⌘/)에서 다시 매핑할 수 있습니다
- **[직접 프로바이더 연결](https://docs.paradev.com/providers)**: OpenRouter, Bedrock, Vertex, Vercel AI Gateway 연결
- **그리고 더 많은 기능**: 매일 출시하기 때문에 이 목록은 늘 뒤처져 있습니다. 진짜 기능 목록은 [변경 로그](https://paradev.com/changelog)입니다.

## 지원 에이전트

Paradev는 다음을 포함한 모든 CLI 기반 코딩 에이전트와 함께 작동합니다:

| 에이전트 | 상태 |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | 완전 지원 |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | 완전 지원 |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | 완전 지원 |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | 완전 지원 |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/muse-white.svg" /><img height="16" align="top" alt="Muse Code" src="../packages/ui/src/assets/icons/preset-icons/muse.svg" /></picture> &nbsp;[Muse Code](https://developer.meta.com/ai/products/muse-code/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/devin-white.svg" /><img height="16" align="top" alt="Devin" src="../packages/ui/src/assets/icons/preset-icons/devin.svg" /></picture> &nbsp;[Devin](https://devin.ai/cli) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | 완전 지원 |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | 완전 지원 |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | 완전 지원 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | 완전 지원 |
| 그 밖의 모든 CLI 에이전트 | 별도 설정 없이 작동 |

터미널에서 돌아간다면, Paradev에서도 돌아갑니다

에이전트는 터미널 그 이상을 얻습니다:

- **모델 선택기**: 에이전트를 실행할 때 모델과 추론 강도를 선택
- **에이전트별 설정**: 설정 → 에이전트에서 실행 명령, 프롬프트 템플릿, 모델 오버라이드를 조정
- **커스텀 에이전트**: 어떤 터미널 에이전트든 전용 아이콘과 함께 추가하면 내장 에이전트처럼 작동
- **상태와 알림**: 작업 중 표시, 완료 알림음, 에이전트가 개입을 필요로 할 때의 Dock 배지
- **내장 채팅**: 채팅 패널에서 모델과 대화. 인라인 도구 승인과 계획 리뷰 지원

<details>
<summary><strong>자주 묻는 질문</strong></summary>
<br />

<details>
<summary>Paradev는 터미널 앱인가요, 데스크톱 앱인가요?</summary>
<br />

Paradev는 터미널 앱이 아니라 데스크톱 앱입니다. 에이전트는 앱 안에서 채팅으로 또는 터미널에서 실행됩니다. 바로 옆에서 차이 뷰어, 풀 리퀘스트, 앱 내 브라우저, 파일 에디터를 함께 사용할 수 있습니다. [FAQ 문서](https://docs.paradev.com/faq)

</details>

<details>
<summary>터미널을 꼭 써야 하나요, 아니면 코딩 에이전트와 채팅할 수 있나요?</summary>
<br />

터미널을 꼭 쓸 필요는 없습니다. Paradev는 에이전트 세션을 터미널 대신 채팅으로 보여 줄 수 있고, 에이전트의 작업은 클릭 한 번으로 승인하거나 거절할 수 있습니다. 채팅은 Claude Code, Codex, OpenCode, Pi에서 동작합니다. Paradev는 이미 설치한 CLI를 그대로 실행하므로 로그인과 설정이 그대로 유지됩니다. **CLI** / **Chat** 토글로 실행 중인 세션을 컨텍스트 손실 없이 전환할 수 있으며, 다른 에이전트는 Paradev 터미널에서 실행됩니다. [채팅 문서](https://docs.paradev.com/chat)

</details>

<details>
<summary>Paradev의 라이선스, 비용, 지원 플랫폼은 어떻게 되나요?</summary>
<br />

Paradev는 MIT 라이선스로 공개된 오픈 소스입니다. Free 요금제에서는 데스크톱 앱과 CLI로 로컬 워크스페이스를 사용할 수 있습니다. 유료 요금제에는 자동화, 클라우드 워크스페이스 같은 기능이 추가됩니다. 데스크톱 앱은 macOS에서 실행되며, 실험적인 Linux AppImage도 있습니다. Windows는 아직 지원하지 않습니다. [가격](https://paradev.com/pricing) · [FAQ 문서](https://docs.paradev.com/faq)

</details>

<details>
<summary>Paradev는 Superset과 같은 건가요? Apache Superset과 관련이 있나요?</summary>
<br />

Paradev의 이전 이름은 Superset이었고, 그래서 CLI 명령어가 여전히 `superset`입니다. 비즈니스 인텔리전스 도구인 Apache Superset과는 관련이 없습니다. [설치 문서](https://docs.paradev.com/install)

</details>

<details>
<summary>Paradev는 어떤 코딩 에이전트를 지원하나요? 제 구독을 그대로 쓸 수 있나요?</summary>
<br />

Paradev는 Claude Code, Codex, OpenCode, Cursor Agent, Gemini CLI, Amp 등을 기본 지원하며, 다른 CLI 에이전트도 얼마든지 추가할 수 있습니다. Claude Code, Codex, OpenCode, Pi는 채팅으로도 실행할 수 있습니다. 에이전트는 여러분의 구독과 API 키를 사용하며, Paradev는 모델 호출을 프록시하지 않습니다. [지원 에이전트 문서](https://docs.paradev.com/supported-agents)

</details>

<details>
<summary>한 저장소에서 여러 코딩 에이전트가 서로의 변경을 덮어쓰지 않게 하려면 어떻게 하나요?</summary>
<br />

Paradev는 에이전트마다 별도의 워크스페이스를 제공합니다. 각 워크스페이스는 자체 브랜치 위의 Git worktree이며, 전용 터미널을 갖습니다. 에이전트들은 작업 파일의 서로 다른 사본을 편집하므로, 한 에이전트가 다른 에이전트의 변경 사항을 덮어쓰지 않습니다. 다만 worktree는 프로세스를 샌드박스로 격리하지 않으며, 브랜치를 머지할 때는 여전히 충돌이 생길 수 있습니다. [워크스페이스 문서](https://docs.paradev.com/workspaces)

</details>

<details>
<summary>Claude Code 터미널 세션이 너무 많아요. 어떻게 관리하나요?</summary>
<br />

Paradev는 모든 에이전트 세션을 하나의 사이드바에 프로젝트별로 묶어 보여 주며, 세션이 채팅으로 실행되든 터미널에서 실행되든 각각의 상태를 표시합니다. Claude Code는 작업을 마쳤을 때와 입력을 기다릴 때 이를 알리고, 사이드바는 확인이 필요한 워크스페이스를 표시해 줍니다. [에이전트 상태 문서](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>같은 작업에 코딩 에이전트 두 개를 실행해 결과를 비교할 수 있나요?</summary>
<br />

네, Paradev에서는 같은 프롬프트를 두 개 이상의 워크스페이스에 줄 수 있습니다. 각 워크스페이스는 자체 브랜치에서 동작하며, 같은 에이전트를 써도 되고 다른 에이전트를 써도 됩니다. 그런 다음 각 diff를 비교해 가장 좋은 결과를 남기면 됩니다. [에이전트 경쟁 레시피](https://docs.paradev.com/recipes/race-agents)

</details>

<details>
<summary>Claude Code와 Codex를 함께 써서, 하나는 코드를 작성하고 다른 하나는 리뷰하게 할 수 있나요?</summary>
<br />

네, Paradev는 Claude Code와 Codex를 나란히 실행하며, 각각 채팅으로 또는 터미널에서 실행할 수 있습니다. 리뷰를 받으려면 풀 리퀘스트의 **Code** 탭에서 줄을 선택해 다른 에이전트에게 보내거나, **Continue with another agent**를 사용해 최근 컨텍스트를 이어받은 다른 에이전트의 세션을 시작하세요. [에이전트 세션 문서](https://docs.paradev.com/agent-sessions)

</details>

<details>
<summary>머지하기 전에 코딩 에이전트의 diff를 리뷰하고 후속 지시를 보내려면 어떻게 하나요?</summary>
<br />

Paradev는 각 워크스페이스의 변경 사항을 차이 뷰어에 보여 주며, 여기서 커밋, 푸시, 풀 리퀘스트 생성을 할 수 있습니다. 풀 리퀘스트의 **Code** 탭에서 줄을 선택해 실행 중인 에이전트나 새 세션에 코멘트를 보내세요. GitHub에 게시하는 것은 선택 사항입니다. 같은 화면에서 체크를 확인하고 머지할 수도 있습니다. [풀 리퀘스트 문서](https://docs.paradev.com/pull-requests)

</details>

<details>
<summary>브랜치마다 개발 서버, 포트, 미리보기를 분리하려면 어떻게 하나요?</summary>
<br />

Paradev는 각 브랜치를 자체 worktree에 두고, 각 워크스페이스의 프로세스가 수신 대기 중인 포트를 워크스페이스별로 묶어 보여 줍니다. 포트를 선택하면 해당 브랜치의 개발 서버가 앱 내 브라우저에서 열립니다. Paradev는 포트 범위를 할당하지 않으므로, 워크스페이스별 설정은 설정 스크립트에서 지정하세요. 설정 스크립트는 새 워크스페이스마다 실행되며, `SUPERSET_WORKSPACE_PATH` 같은 변수를 사용할 수 있습니다. [포트 문서](https://docs.paradev.com/ports)

</details>

<details>
<summary>실행 중인 웹 앱에서 요소를 클릭해 코딩 에이전트가 바꾸게 할 수 있나요?</summary>
<br />

네, Paradev의 앱 내 브라우저에는 Design 모드가 있습니다. 개발 서버를 열고 **Design**을 켠 다음 요소를 클릭하세요. 이어서 원하는 변경을 설명하면, 에이전트는 여러분의 메모와 함께 요소의 세부 정보와 스크린샷을 받습니다. [브라우저 문서](https://docs.paradev.com/browser)

</details>

<details>
<summary>코딩 에이전트가 입력을 필요로 할 때 알림을 받을 수 있나요?</summary>
<br />

네, Paradev 데스크톱 앱은 에이전트가 작업을 마치거나 입력을 기다리며 멈추면 알림을 보내고, macOS Dock 아이콘에 배지를 표시합니다. 지원 범위는 에이전트마다 다릅니다. Claude Code는 두 상태를 모두 알리지만, 일부 에이전트는 작업을 마쳤을 때만 알립니다. 모바일 앱에서는 에이전트에 권한 승인이 필요하면 워크스페이스에 점이 표시됩니다. 푸시 알림은 아직 지원하지 않습니다. [에이전트 상태 문서](https://docs.paradev.com/agent-status)

</details>

<details>
<summary>iPhone에서 코딩 에이전트를 확인하고 응답할 수 있나요?</summary>
<br />

네, iPhone 및 iPad용 Paradev에서 에이전트를 시작하고, 세션을 실시간으로 지켜보고, 응답하고, 변경 사항을 리뷰할 수 있습니다. iOS 26 또는 iPadOS 26 이상과 Paradev Pro가 필요하며, Google Play에서 Android 앱도 받을 수 있습니다. 컴퓨터에 있는 워크스페이스를 사용하려면 원격 접속을 켜고, 컴퓨터가 잠자기 상태로 전환되지 않고 온라인을 유지하도록 하세요. [모바일 앱 문서](https://docs.paradev.com/mobile)

</details>

<details>
<summary>야간 유지보수나 주간 flaky 테스트 점검처럼 코딩 에이전트를 일정에 맞춰 실행할 수 있나요?</summary>
<br />

네, Paradev 자동화는 매시간, 매일, 매주 또는 사용자 지정 일정으로 에이전트를 실행합니다. 실행할 때마다 워크스페이스가 생성되며, 그곳에서 변경 사항을 리뷰하고 작업을 이어 갈 수 있습니다. 자동화에는 Pro 요금제가 필요합니다. [자동화 문서](https://docs.paradev.com/automations)

</details>

<details>
<summary>Slack, Linear, Sentry 또는 GitHub 풀 리퀘스트에서 코딩 에이전트를 시작할 수 있나요?</summary>
<br />

네, Paradev 자동화는 GitHub 풀 리퀘스트 이벤트, Slack 메시지, Linear 이슈, Sentry 이슈 또는 웹훅이 들어오면 에이전트를 시작하며, 에이전트는 여러분의 프롬프트와 함께 이벤트 세부 정보를 받습니다. Slack에서 Paradev 봇을 멘션해 클라우드 워크스페이스와 에이전트를 시작할 수도 있습니다. 자동화와 Slack 연동에는 Pro 요금제가 필요합니다. [자동화 문서](https://docs.paradev.com/automations)

</details>

<details>
<summary>명령줄이나 다른 에이전트에서 코딩 에이전트를 시작할 수 있나요?</summary>
<br />

네, Paradev CLI는 셸 스크립트나 다른 에이전트에서 워크스페이스를 만들고 그 안에서 에이전트를 시작합니다. 에이전트는 Paradev MCP 서버를 사용해 워크스페이스와 터미널을 다룰 수도 있습니다. 데스크톱 앱에는 orchestrate 스킬이 포함되어 있어, 하나의 에이전트가 별도 워크스페이스에 있는 작업자 에이전트들을 조율할 수 있습니다. [CLI 문서](https://docs.paradev.com/cli/getting-started)

</details>

<details>
<summary>원격 머신이나 클라우드에서 코딩 에이전트를 실행하고, 노트북에서 변경 사항을 리뷰할 수 있나요?</summary>
<br />

네, Paradev 원격 접속(Pro 요금제)을 사용하면 Mac mini나 서버 같은 다른 머신에서 호스팅되는 워크스페이스를 노트북에서 열 수 있습니다. 클라우드 워크스페이스(Team 및 Ultra 요금제)는 각 워크스페이스를 전용 클라우드 머신에서 실행하므로, 노트북을 닫아도 에이전트가 계속 작업합니다. [원격 접속 문서](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>에이전트 세션과 브랜치를 그대로 둔 채, 나중에 작업으로 돌아올 수 있나요?</summary>
<br />

네, Paradev 워크스페이스는 삭제하기 전까지 해당 브랜치의 Git worktree로 디스크에 남아 있습니다. 터미널은 백그라운드 프로세스에 속해 있으므로, 앱을 닫거나 업데이트해도 계속 실행되고 스크롤백도 유지됩니다. 크래시나 재시작으로 터미널이 멈추더라도, Claude Code나 Codex처럼 재개를 지원하는 에이전트라면 Paradev가 에이전트 세션을 재개할 수 있습니다. [에이전트 계속 실행하기 문서](https://docs.paradev.com/keep-agents-running)

</details>

<details>
<summary>소규모 팀이 코딩 에이전트용으로 머신 한 대를 공유할 수 있나요?</summary>
<br />

네, Paradev 호스트는 Mac mini 같은 공유 머신이 될 수 있으며, 팀원은 원격 접속(Pro 요금제)으로 연결합니다. 호스트가 처음 온라인 상태가 되면 호스트를 시작한 사람만 접근할 수 있습니다. 그 사람이 **Settings → Hosts**에서 팀원을 추가합니다. [원격 접속 문서](https://docs.paradev.com/remote-access)

</details>

<details>
<summary>Paradev는 Conductor, Orca, Cursor와 어떻게 다른가요?</summary>
<br />

Paradev, Conductor, Orca는 모두 코딩 에이전트를 병렬 Git worktree에서 실행하며, Cursor는 자체 에이전트를 중심으로 만든 AI 에디터입니다. Paradev는 여러분의 구독으로 어떤 CLI 에이전트든 실행하고, Cursor에서 편집하고 싶을 때는 워크스페이스를 Cursor에서 열어 줍니다. Orca도 오픈 소스이며, Paradev가 아직 지원하지 않는 Windows에서 실행됩니다. Conductor는 Meta에 합류할 예정이며 신규 사용자를 더 이상 받지 않습니다. Paradev에는 Conductor 워크스페이스를 옮겨 오는 가이드가 있습니다. [Conductor에서 마이그레이션](https://docs.paradev.com/migrate-from-conductor)

</details>

<details>
<summary>Paradev가 tmux를 대체할 수 있나요?</summary>
<br />

네, 코딩 에이전트를 실행하는 용도라면 Paradev가 tmux를 대체할 수 있습니다. Paradev의 터미널 세션은 앱을 닫거나, 종료하거나, 업데이트해도 계속 실행됩니다. 각 워크스페이스에는 자체 worktree와 사이드바 상태도 있습니다. Paradev 터미널 안에서 tmux를 계속 실행할 수도 있습니다. [에이전트 계속 실행하기 문서](https://docs.paradev.com/keep-agents-running)

</details>

</details>

## 데스크톱 앱, 그 이상

모든 사용 환경이 같은 워크스페이스에 연결되므로, 앱에서 작업을 시작하고 어디서든 확인할 수 있습니다.

| 사용 환경 | 제공 기능 |
|:--------|:-------------|
| [**데스크톱 앱**](https://github.com/paradevai/paradev/releases/latest) | 완전한 IDE: 터미널, 차이 뷰어, 앱 내 브라우저, 자동화 |
| [**CLI**](https://docs.paradev.com/cli/getting-started) | 어떤 셸에서든 워크스페이스, 에이전트, 터미널, 호스트를 관리하는 단일 `superset` 바이너리 |
| [**TypeScript SDK**](https://docs.paradev.com/sdk/getting-started) | [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk)로 Node, Bun, Deno에서 Paradev를 프로그래밍 방식으로 제어 |
| [**MCP 서버**](https://docs.paradev.com/mcp) | Claude Code, Codex, Cursor 같은 에이전트가 직접 워크스페이스를 만들고 관리 |

CLI는 데스크톱 앱에 번들로 포함되어 있으며, 단독으로 설치할 수도 있습니다:

```bash
curl -fsSL https://paradev.com/cli/install.sh | sh
# or
brew install paradevai/tap/superset
```

iOS 앱도 곧 출시됩니다. 휴대폰에서 에이전트를 확인할 수 있게 됩니다.

## 설치

데스크톱 앱 다운로드:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/paradevai/paradev/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/paradevai/paradev/releases/latest/download/Paradev-x86_64.AppImage) (실험적; macOS가 주 지원 대상입니다)
- **Windows**: 아직 제공되지 않음
- [모든 빌드](https://github.com/paradevai/paradev/releases/latest)

필요한 것은 [Git](https://git-scm.com/)뿐입니다. [gh](https://cli.github.com/)는 선택 사항으로 PR 워크플로를 사용할 수 있게 해 주며, Paradev가 대신 설치해 주겠다고 제안합니다.

## 개발

Paradev를 직접 만져 보거나 PR을 기여하고 싶으신가요? 저장소를 클론하고, 설치된 Paradev 앱에 추가한 다음, 변경 작업용 워크스페이스를 만드세요:

```bash
git clone https://github.com/paradevai/paradev.git
```

그런 다음 해당 워크스페이스 터미널에서 개발 설정을 실행하세요:

```bash
./.paradev/setup.local.sh
bun run dev
```

`setup.local.sh`는 새 worktree마다 한 번씩 실행하세요. 워크스페이스별 앱 아이덴티티와 포트를 구성해서 개발용 데스크톱 앱이 설치된 Paradev 앱 및 다른 개발 worktree와 나란히 실행될 수 있게 합니다.

Neon 계정이나 서드파티 자격 증명은 필요 없습니다. `setup.local.sh`가 Docker로 로컬 Postgres + Electric 스택을 띄우고 개발 계정을 시드합니다. **"Sign in as dev"** 버튼(또는 `admin@local.test` / `supersetdev`)으로 로그인하세요.

사전 요구 사항: [Bun](https://bun.sh/) v1.4.3+(`.bun-version`에 고정), `docker`, `jq`, `caddy`. `caddy`는 `bun dev`가 로컬 HTTPS 프록시로 실행합니다(`brew install jq caddy && caddy trust`).

전체 가이드는 [**DEVELOPMENT.md**](../DEVELOPMENT.md)를 참고하세요: 설정 스크립트가 하는 일, 실제 서비스 대상 수동 설정, 자주 쓰는 명령, 문제 해결, 데스크톱 앱 빌드 방법을 다룹니다. 기여 절차는 [**CONTRIBUTING.md**](../CONTRIBUTING.md)에 있습니다.

## 구성

워크스페이스의 설정, 정리, 실행 스크립트는 `.paradev/config.json`에서 구성합니다. [전체 문서](https://docs.paradev.com/setup-teardown-scripts)를 참고하세요.

```json
{
  "setup": ["./.paradev/setup.sh"],
  "teardown": ["./.paradev/teardown.sh"],
  "run": ["./.paradev/run.sh"]
}
```

키보드 단축키는 **설정 → 키보드 단축키**(⌘/)에서 사용자 지정할 수 있습니다. [전체 단축키 목록](https://docs.paradev.com/keyboard-shortcuts)도 참고하세요.

## 기술 스택

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

## 기본이 프라이빗

- **명시적 연결**: 어떤 에이전트, 프로바이더, 통합을 연결할지 직접 선택합니다.

## 기여

기여를 환영합니다! 환경을 준비하고 PR을 여는 방법은 [CONTRIBUTING.md](../CONTRIBUTING.md)를 참고하세요. 버그와 기능 요청은 [issues](https://github.com/paradevai/paradev/issues)에 남겨 주세요.

<a href="https://github.com/paradevai/paradev/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=paradevai/paradev" />
</a>

## 커뮤니티

Paradev 커뮤니티에 참여해 도움을 받고, 피드백을 나누고, 다른 사용자와 교류하세요:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: 팀 및 커뮤니티와 대화
- **[Twitter](https://x.com/paradevai)**: 업데이트와 소식 팔로우
- **[GitHub Issues](https://github.com/paradevai/paradev/issues)**: 버그 신고와 기능 요청
- **[GitHub Discussions](https://github.com/paradevai/paradev/discussions)**: 질문과 아이디어 공유

### 팀

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## 라이선스, 그리고 영원히 무료인 것

**데스크톱 앱은 영원히 무료입니다.** 자신의 컴퓨터에서 에이전트를 병렬로 실행하는 데는 결코 비용이 들지 않습니다. 유료화가 있더라도 그 위에 얹히는 선택적 서비스일 뿐입니다.

앱 전체가 이 저장소에 [MIT 라이선스](../LICENSE.md)로 공개되어 있습니다: 사용하고, 포크하고, 수정하고, 셀프 호스팅하고, 재배포하세요.
