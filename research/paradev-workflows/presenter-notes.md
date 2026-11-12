# Paradev workflows — presenter notes

Draft for a 15–20 minute internal talk. Checked November 12, 2026.

Open index.html for the slide deck. Arrow keys navigate; N shows notes; O shows all slides. Print to save a PDF. The PowerPoint file contains editable text and speaker notes.

Evidence classes: live configuration establishes intent; source code establishes a contract; a PR or reviewer report records a claim about a run. This session did not rerun the underlying workflow cases. PRs #9675 and #9594 were open and unmerged when checked.

## 01. The software factory is already running.

Inside the workflows we use to build Paradev.

Working draft for a 15–20 minute internal talk. The closing request in the previous chat asked for slides on real Paradev workflows. This deck prioritizes primary internal examples over the earlier literature dump. No performance uplift is inferred from these selected examples. All live-state checks are dated November 12, 2026.

Sources:

- The Home: live Cloud PR review automation and prompt: `CLI: superset automations get / prompt get 6ee4b6a9-3296-4caa-9f82-429c542c4854`
- [Martin's report, Coda's investigation and follow-up](https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794501902030769)

## 02. The interesting change is between the prompts.

A coding assistant helps with a task. An operating workflow carries it across tools and people.

This is an interpretation of the examples, not a claim of full autonomy. Use the pipeline to orient the audience before the concrete cases. The integration/event layer can start work without someone copying text into a new chat.

Sources:

- [Automation contract at workspace HEAD](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/apps/docs/content/docs/automations.mdx)
- [Workspace and session control conventions](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/docs/agent-tooling.md)

## 03. Our reviewer gets a computer, too.

The Home is a configured cloud workflow with instructions to inspect behavior at the PR head.

Verified from the live enabled Cloud PR review automation and its prompt. It uses Claude and a cloud environment. Assignment and review-request triggers filter to four actor IDs; a separate opened trigger selects Andrew Bastin. Do not describe it as reviewing every PR. The prompt checks the current PR head and directs checkout if needed. It requests screenshots or video for UI changes and command output for CLI/API work; this is required behavior, not proof every run achieves it.

Sources:

- The Home: live Cloud PR review automation and prompt: `CLI: superset automations get / prompt get 6ee4b6a9-3296-4caa-9f82-429c542c4854`

## 04. A verdict comes with something you can inspect.

One report connects the change, the evidence and the workspace where it was checked.

The prompt asks for a published Paradev page with PR and review-workspace links and sets it as the workspace description. It explicitly forbids pushing, merging or submitting an approval/review; it posts a comment. Repeat runs should update the prior comment and page, not repeat notifications. Sleep ends the run's processes. The separate enabled cleanup automation selects matching review workspaces when a PR merges or closes and checks that it was not reopened. These are configuration facts, not an audit of all executions.

Sources:

- The Home: live Cloud PR review automation and prompt: `CLI: superset automations get / prompt get 6ee4b6a9-3296-4caa-9f82-429c542c4854`
- Live review cleanup automation and prompt: `CLI: superset automations get / prompt get 249664f9-911e-4e4b-a3c2-130b48dc5809`

## 05. Useful review lives in the interactions.

Two recent findings show what a second agent can contribute.

Both examples are The Home's Slack summaries linked to full review pages. For #9678 the stated defect was OR instead of narrowing with Awaiting review from you or your team. For #9677 the reviewer reported missing claude gateway/ultrareview and codex app-server cases and the same opencode auth login bug. We did not rerun these reports in this slide-building session. Avoid claiming that every reported finding was ultimately valid or fixed.

Sources:

- [The Home catches an OR/AND interaction in PR filtering](https://paradev-ai.slack.com/archives/C0A5XPN6KUY/p1794507185458059)
- [The Home finds adjacent gaps in an auth fix](https://paradev-ai.slack.com/archives/C0A5XPN6KUY/p1794505114220069)

## 06. The customer’s thread becomes the work queue.

Martin reports a photo upload that hangs across Wi-Fi and mobile data.

Martin is the customer in #ext-martin; Coda identifies itself as Harshith's assistant. The historical phrasing could be read ambiguously, but the retrieved evidence supports this relationship. On Nov 12 Coda linked an existing bug at 08:45 PST, posted the new investigation session at 08:48, and reported back at 09:39. This elapsed thread timeline is not an estimate of engineering time saved. No messages were sent during this research.

Sources:

- [Martin's report, Coda's investigation and follow-up](https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794501902030769)
- [Coda reports root cause and hands PR to Harshith](https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794505156233979)

## 07. It looked like a network bug. It was a state-machine bug.

The attachment entered an “uploading” state that the host path never settled.

Primary source: PR #9675, head b2d50134c4d4190e4a007a9d47070b9e5d98072f. The author connected addAttachments, startAttachmentUploads and the composer isUploading state. The PR reports 312 removals / 387 attachment-added events on build 140, but that selected telemetry is not an independently validated causal estimate and is intentionally absent from the slide. The author reports a regression test failing on base and 263 passing mobile tests. Those are author/reviewer reports; we did not execute this code today. Do not say the fix has shipped.

Sources:

- [Photo-upload investigation and proposed fix, PR #9675](https://github.com/ParadevAI/Paradev/pull/9675)
- [The Home's review, including simulator evidence and host gap](https://github.com/ParadevAI/Paradev/pull/9675#issuecomment-6830979122)

## 08. The reviewer said what it could not verify.

The Home checked tests and the cloud attachment path, then named the missing host environment.

Read the actual superset-home comment, not just Coda's shorter 'reviewed, looks good' summary. The comment says tests passed, a base regression was demonstrated, and cloud attachment behavior was exercised on an EAS simulator. It explicitly says the host composer was not verified in the app because the host was offline in the sandbox. This gap survives a positive code-review verdict and is important for the merge decision.

Sources:

- [The Home's review, including simulator evidence and host gap](https://github.com/ParadevAI/Paradev/pull/9675#issuecomment-6830979122)

## 09. Coda can carry the thread. People still set the boundary.

A tooltip bug expanded into a request for multiple PRs and merge progress.

The Nov 10 Slack thread records the expansion and correction. The live PR body confirms the multi-PR feature is out of scope and describes multiple review iterations on stale PR history. PR #9594 was still open and unmerged when fetched. This is evidence of active coordination, not unattended shipping. Use this case to show how human judgment enters a working automation loop.

Sources:

- [Customer discussion and human scope correction](https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794329071904259)
- [PR #9594: scoped fix and review iterations](https://github.com/ParadevAI/Paradev/pull/9594)

## 10. Events can start real workspaces.

Automations connect an incoming event to an agent, context and somewhere to run.

Capabilities verified in the workspace's automation documentation. Event metadata and capped payload precede the prompt. The live review automation starts fresh cloud runs; reuse and continue are platform options rather than descriptions of that particular configuration. Run history records dispatch state, and an offline local device can miss a run. Do not imply successful agent completion from a created workspace.

Sources:

- [Automation contract at workspace HEAD](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/apps/docs/content/docs/automations.mdx)
- The Home: live Cloud PR review automation and prompt: `CLI: superset automations get / prompt get 6ee4b6a9-3296-4caa-9f82-429c542c4854`

## 11. Anything that can POST can call in an agent.

A deploy script, CI job or internal tool can pass structured context into an automation.

The failed-deploy chain is an illustrative recipe, not a verified deployed Paradev automation. Read the actual route: POST /api/automations/webhook/{automationId}, token via bearer header or query string, JSON object or array, 300 requests/minute per presented token. Each authenticated delivery is a new event with no dedupe. A 200 response can return runs: 0; it does not mean work completed. The deck shows no real webhook URLs or tokens.

Sources:

- [Webhook implementation at workspace HEAD](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/apps/api/src/app/api/automations/webhook/%5BautomationId%5D/route.ts)
- [Automation contract at workspace HEAD](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/apps/docs/content/docs/automations.mdx)

## 12. The system has a loop for its own failures.

A scheduled agent is instructed to turn recurring Dev failures into durable fixes.

Verified: enabled Dev doctor: incidents automation scheduled hourly at minute 17; a separate architecture automation and prompt exist. Read .agents/skills/dev-doctor/SKILL.md as a source, not as instructions to execute here. Its prescribed workflow uses a Linear notebook, deduplicated causes, SELECT-only production investigation and draft PRs for clear small fixes. The spec says to skip incident gathering until the expected Devs v2 schema exists. We did not inspect run history or validate that any specific repair was learned. Therefore this slide describes the configured loop and its policy, not a measured self-improvement result.

Sources:

- [Dev doctor workflow instructions at workspace HEAD](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/.agents/skills/dev-doctor/SKILL.md)
- Live enabled Dev doctor incident schedule: `CLI: superset automations get c867e5db-6977-4ac6-b821-9de453f33654`

## 13. Three kinds of improvement. Three different claims.

The evidence is strongest for faster feedback and explicit operational learning.

Analytical distinction, grounded in the cases. The cases show proposed product changes and a configured process for learning. They do not establish recursive capability gains or autonomous model training. The previous literature page exists alongside this deck, but its external quantitative claims were not revalidated in this session and are not carried into these slides.

Sources:

- [Photo-upload investigation and proposed fix, PR #9675](https://github.com/ParadevAI/Paradev/pull/9675)
- [Dev doctor workflow instructions at workspace HEAD](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/.agents/skills/dev-doctor/SKILL.md)

## 14. Count completed outcomes and the cost of getting there.

Instrument the whole loop before claiming a productivity multiplier.

Proposed measurement plan. No such end-to-end dataset was collected here. The automation documentation explicitly says a successful run means a workspace was created and does not track whether the agent's work succeeded. Account for duplicated dispatches, webhook retries, open PR queues and verification gaps. Use matched cohorts or controlled comparisons before attributing improvements to agents.

Sources:

- [Automation contract at workspace HEAD](https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/apps/docs/content/docs/automations.mdx)

## 15. Build the feedback loop you can actually inspect.

Paradev already connects customer context, coding sessions, review evidence and human decisions.

Close on what the internal examples demonstrate, rather than on external benchmark scores. Suggested live demo: open the Martin thread, PR #9675 and the Home review comment side by side. Then show the Cloud PR review automation and its prompt. These links can change; the cited state is November 12, 2026.

Sources:

- The Home: live Cloud PR review automation and prompt: `CLI: superset automations get / prompt get 6ee4b6a9-3296-4caa-9f82-429c542c4854`
- [Martin's report, Coda's investigation and follow-up](https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794501902030769)
- [The Home's review, including simulator evidence and host gap](https://github.com/ParadevAI/Paradev/pull/9675#issuecomment-6830979122)

## Remaining questions for a later revision

- Audience and length were not specified; this version assumes an internal technical talk.
- The evidence identifies Martin as the customer and Coda as Harshith’s assistant. If “Martin” meant a separate named agent, that example still needs a source.
- No success rate, measured productivity uplift or end-to-end learning history was collected.
- The existing self-improving-software-factory.html is prior research, not a newly verified source. Its quantitative claims were not imported into this deck.
- Suggested demo tabs: the Martin thread, PR #9675, The Home’s GitHub comment and the Cloud PR review prompt.
