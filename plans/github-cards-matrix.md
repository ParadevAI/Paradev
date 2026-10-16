# GitHub cards: interaction matrix

Every interaction of the five GitHub cards, looked at in GitHub itself (github.com, signed in as the
reader, driven over CDP; menus and pickers were opened and closed without choosing anything) and in
the running desktop dev app, then compared. No write was sent to GitHub from either side. Our reads
ran against real data: pull requests #8100 (a failed Test job), #8014 (conflicts) and #8101 (behind
by 2) of `superset-sh/superset`, a waiting run of `pytorch/pytorch`, the release after
`desktop-v1.35.0`, and issue #8061.

Headless tests behind these rows: `githubCards.test.ts` (API, against `githubRecorded.json`) and
`GithubCiFailedBlock.test.tsx`, `GithubBranchBlock.test.tsx`, `GithubDeploymentBlock.test.tsx`,
`GithubReleaseBlock.test.tsx`, `GithubIssueBlock.test.tsx` (UI).

`[x]` same as GitHub · `[~]` ours differs on purpose · `[-]` not comparable, with the reason

## CI failed

| | Interaction | GitHub | Ours |
|---|---|---|---|
| [x] | Which job failed | red cross on "Test" in the job list | the failed job by name under its run, `CI #20846` |
| [x] | Which step failed | the failed step is expanded | "Step 6: Test" |
| [~] | Log | the whole step log, scrolled to the last error line | the 30 lines that lead to the first error, since the last line is often only "exit code 1" |
| [x] | Error lines | red "Error:" lines in the log | GitHub's error lines listed above the log |
| [x] | Annotations | "Open job annotations": file, line, message | file and line with the message |
| [x] | Timestamps and colour codes | hidden unless asked | stripped |
| [x] | Re-run menu | "Re-run jobs": Re-run failed jobs, Re-run all jobs | the same two actions |
| [~] | Re-run confirm | a dialog with the job list and "Enable debug logging" | a confirm that names the runs; no debug logging |
| [x] | Re-run while running | the menu is absent | off, "CI #20846 is still running" |
| [~] | Several failed workflows | one page per run | one card, one re-run for all of them, named in the confirm |
| [x] | Other apps' checks | listed in the merge box with "Details" | listed with a link; not re-runnable |
| [-] | Explain error (Copilot) | button | the card's own "Start an agent to fix it" |
| [-] | Search logs | search box | open on GitHub |

## Branch out of date or in conflict

| | Interaction | GitHub | Ours |
|---|---|---|---|
| [x] | Behind | "This branch is out-of-date with the base branch" | the same sentence, with the count |
| [~] | What is missing | not shown | the newest base commits the branch lacks |
| [x] | Update menu | "Update branch": Update with merge commit, Update with rebase | the same two |
| [~] | Update confirm | none; it runs at once | a confirm: "Merge main into … ?" or "Rebase … onto main and force-push it … ?" |
| [x] | Conflicts | "This branch has conflicts that must be resolved" | the same sentence |
| [-] | Conflicting files | listed | not listed: the API does not give them |
| [~] | Resolve conflicts | web editor or the command line | "Resolve with an agent" |
| [x] | Still checking | "Checking for ability to merge automatically" | "Checking for the ability to merge" |
| [~] | GitHub shows "Update branch" only when the repository asks for it | hidden on `superset-sh/superset` | always offered when the branch is behind |

GitHub's side of the update rows comes from its documentation screenshots: `superset-sh/superset`
does not show the "Update branch" button.

## Deployment waiting for approval

| | Interaction | GitHub | Ours |
|---|---|---|---|
| [x] | Which run | run page: workflow, number, branch, commit, actor | the same facts |
| [x] | What waits | "Review deployments": one checkbox per environment | one checkbox per environment |
| [x] | Who reviews | reviewers under each environment | reviewers with avatar or team name |
| [x] | Not a reviewer | no "Review deployments" button | checkboxes off; "You are not a reviewer for …" |
| [x] | Comment | "Leave a comment" | the same field |
| [x] | Buttons | Reject, Approve and deploy | the same two |
| [~] | Confirm | none | a confirm that names the environments and the run |
| [-] | Wait timer countdown | live | the minutes are shown, not counted down |

GitHub's reviewer dialog could not be captured: the reader reviews no environment anywhere. The
reference is the run page of a waiting public run, as a non-reviewer.

## Cut a release

| | Interaction | GitHub | Ours |
|---|---|---|---|
| [x] | Tag | "Tag: Select tag", new or existing | the agent's tag, marked new or existing |
| [~] | Target | "Target: main", a branch | the branch and the commit it points to now; the tag is pinned to that commit |
| [x] | Title | "Release title" | title field |
| [x] | Notes | Write / Preview Markdown box | the shared Markdown editor |
| [x] | Generate | "Generate release notes" | the same action, GitHub's own text |
| [~] | Before generating | empty box | the agent's draft, or the newest commits since the previous release |
| [x] | Previous tag | "Previous tag: auto" | the previous release, with the commit count and compare link |
| [x] | Pre-release | "Set as a pre-release" | the same checkbox |
| [x] | Latest | "Set as the latest release" | the same checkbox; off for a pre-release |
| [x] | Buttons | Publish release, Save draft | the same two |
| [~] | Confirm | none | a confirm with the title, tag, commit, and "It becomes the latest release." |
| [~] | A draft or release already exists for the tag | GitHub lets you make another | both actions off, with a link to the one that exists |
| [-] | Attach binaries | drop area | not offered |
| [-] | Discussion for the release | checkbox | not offered |

## Issue triage

| | Interaction | GitHub | Ours |
|---|---|---|---|
| [x] | Issue | title, number, open badge, author, body | the same |
| [x] | Labels picker | "Apply labels to this issue": filter, colour, description, checkmarks | the same list, filter and marks |
| [x] | Assignees picker | "Select assignees": filter, avatar, login | the same |
| [~] | When a change is saved | on closing the picker | on Apply, after a confirm that names what changes |
| [~] | Suggestions | "Suggestions" group from GitHub | the agent's labels and people, pre-selected |
| [x] | Up to ten assignees | enforced | enforced |
| [x] | Close as duplicate | "Close as duplicate" with an issue picker | the action, for the issue the agent named |
| [-] | Type, projects, milestone, relationships | sidebar rows | not offered |
