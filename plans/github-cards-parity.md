# GitHub cards: parity checklist

Five inbox cards for work that GitHub asks of a person, beside the pull request merge card: a failed
check on your pull request, a branch that is behind or in conflict, a deployment waiting at an
environment gate, a release to cut, and an issue to triage. Pull request review is not here; it
lives in HTML pages. Each card was compared with GitHub's own UI for the same action and resolved
in the desktop dev app against real pull requests, check runs, a waiting deployment, releases and
issues. The cell-by-cell comparison is in `plans/github-cards-matrix.md`.

**No write was sent to GitHub.** Every read below ran live with the reader's own GitHub connection.
Every write is covered by a headless test that asserts the exact request against recorded API
answers (`githubCards.test.ts`, `githubRecorded.json`), and its confirm was opened in the dev app
and cancelled. The live write checks that remain are listed at the end.

Status: `[x]` verified live in the dev app (reads) · `[~]` built, tested headless, confirm opened and cancelled; the live write is left for Satya · `[ ]` open · `[-]` not doing, with the reason

## 0. For every card

- [x] The cards act as the reader, with their own GitHub connection (the GitHub App's user token); without one the card says "Connect GitHub to do this as you"
- [x] One GitHub layer (`githubClient.ts`, `githubPull.ts`) for all six GitHub cards; the older merge card was moved onto it
- [x] GitHub's refusals read as sentences: reconnect, rate limit, not installed or not permitted, renamed repository, GitHub's own validation reason
- [x] Every confirm states the exact write from facts the card resolved; where it depends on what the reader chose, the server builds the same sentence and refuses a mismatch
- [x] Facts that can move on GitHub are bound: the head commit for a re-run and a branch update, the commit a new tag points to, the current labels and assignees
- [x] "Start an agent" uses the Sentry card's action; the prompt puts the task first and fences what other people wrote (titles, logs) as data
- [x] A card whose refs the agent changed while an action was in flight is refused, not overwritten (`inbox.act` checks the document version on write-back)
- [ ] The GitHub App needs **Deployments: read and write** before a deployment can be approved or rejected; the dev and production apps do not have it
- [ ] Writes run inside the action's database transaction; a lost connection after GitHub took the write loses the record of it (a draft release is the one write GitHub would then accept twice; the card blocks it once the draft is visible)

## 1. CI failed on your pull request (`github.ci_failed`)

Compared with: the failing job's log view and the "Re-run jobs" menu.

- [x] Pull request header: repository and number, title, state, author, `head → base`
- [x] "n of m checks failing"; each failed Actions run by GitHub's name (`CI #20846`) with its attempt
- [x] Per failed job: the failing step, GitHub's error lines, the annotations in the code (`path:line`), and the end of the log up to the first error, without timestamps and colour codes
- [x] Failing checks from other apps and failing commit statuses are listed with a link
- [x] Checks still running, no checks, and no failing checks each say so
- [~] Re-run failed jobs, with the confirm naming the runs
- [~] Re-run all jobs
- [x] A re-run is off with a reason while a run is going, on a closed pull request, and without push access
- [x] Start an agent to fix it: a workspace with the failing step, errors and log as its task
- [-] Re-run one job: GitHub's per-job button; the card re-runs what failed
- [-] "Enable debug logging" on a re-run: GitHub's option; not offered
- [-] The whole log and log search: "Open on GitHub" leads there

## 2. Branch out of date or in conflict (`github.branch`)

Compared with: the merge box's "This branch is out-of-date" and "This branch has conflicts" banners and the "Update branch" menu.

- [x] Behind: how many commits, and the newest base commits the branch lacks
- [x] Conflicts: said plainly; Update is off and the agent action reads "Resolve with an agent"
- [x] GitHub still checking, up to date, merged and closed each say so
- [~] Update with merge commit
- [~] Update with rebase (the confirm says it force-pushes)
- [x] Rebase with an agent / Resolve with an agent: a workspace with that task
- [-] The list of conflicting files: GitHub's API does not give it; the agent finds them
- [-] GitHub's web conflict editor: the agent or the reader's machine does this

## 3. Deployment waiting for approval (`github.deployment`)

Compared with: the "Review pending deployments" dialog. Our repository has no protected environment, so the live read ran on a public run that is waiting (`pytorch/pytorch`), where the reader is not a reviewer.

- [x] The run by GitHub's name (`Deploy #482`), its title, branch, commit and who started it
- [x] Each waiting environment with its reviewers, wait timer, and whether the reader may approve
- [x] A run with nothing waiting, and environments the reader does not review, say so
- [~] Approve and deploy, for the environments left checked, with a comment (the confirm was opened in Storybook only: the reader reviews no environment)
- [~] Reject, the same way (confirm in Storybook only)
- [-] "Start all waiting jobs" (bypass protection rules): an admin override; not from a card

## 4. Cut a release (`github.release`)

Compared with: the "Draft a new release" form.

- [x] Tag (new or existing), the commit it points to, the previous release and the number of commits since
- [x] Notes: the agent's draft, or the newest commits since the previous release with a link to the full changelog
- [x] Title and notes are editable; notes in the shared Markdown editor
- [x] "Set as a pre-release" and "Set as the latest release", as on GitHub
- [x] A tag that is already released, or already has a draft, cannot be released a second time
- [~] Generate release notes (GitHub's own; it creates nothing); it asks first when notes are already drafted
- [~] Publish release (the confirm names the title, the tag, the commit, and whether it becomes the latest)
- [~] Save draft
- [-] Attaching binaries: release assets come from CI in this repository
- [-] "Create a discussion for this release": not offered
- [-] Choosing another target branch in the card: the agent sets it; the card shows it

## 5. Issue triage (`github.issue`)

Compared with: the issue sidebar's label and assignee pickers and "Close as duplicate".

- [x] Issue header, author, age, comment count, and the body
- [x] Labels picker with the repository's labels (colour, description, type to filter)
- [x] Assignees picker with the people who can be assigned
- [x] The agent's suggestions are pre-selected only when the repository has them
- [x] The issue's current labels and people stay selectable even when outside the listed options
- [~] Apply: the confirm names only what changes (`add labels …; remove labels …; assign …; unassign …`)
- [~] Close as duplicate, naming the other issue
- [x] A closed issue, a pull request, and an account that cannot triage each say so
- [-] Issue type, projects, milestone, relationships: later
- [-] A comment with the triage: later; the duplicate link itself is set by GitHub

## What the dev app run did

Each card was pushed into the dev inbox and opened. For every write the confirm was opened, read and
cancelled, and GitHub was read afterwards to see that nothing moved: run 37098177509 is still on
attempt 1, #8101's head is unchanged, no `desktop-v1.36.0` tag or release exists, and issue #8061
has no labels, no assignee and the same `updated_at`.

| Confirm | Sentence shown |
|---|---|
| Re-run failed jobs | Re-run the failed jobs of CI #20846 on superset-sh/superset#8100? |
| Re-run all jobs | Re-run all jobs of CI #20846 on superset-sh/superset#8100? |
| Update with merge commit | Merge main into saddlepaddle/ci-speedups on superset-sh/superset#8101? |
| Update with rebase | Rebase saddlepaddle/ci-speedups onto main and force-push it on superset-sh/superset#8101? |
| Publish release | Publish the release "Superset Desktop desktop-v1.36.0" on superset-sh/superset, with the new tag desktop-v1.36.0 on main at b8c5ad7? It becomes the latest release. |
| Save draft | Save "Superset Desktop desktop-v1.36.0" as a draft release on superset-sh/superset, with the new tag desktop-v1.36.0 on main at b8c5ad7? Nothing is published. |
| Generate release notes | Replace the notes with GitHub's? |
| Apply | On superset-sh/superset#8061: add labels bug; assign saddlepaddle? |
| Close as duplicate | Close superset-sh/superset#8061 as a duplicate of #8062 "[feat] Use the global default editor as fallback for projects with no "Open in…"? |

## Live write checks left for Satya

Each needs one click in the dev app on a pull request, run, release or issue of your choice:

1. Re-run failed jobs on a pull request with a failed Actions job; then "Re-run all jobs" on another
2. Update with merge commit on a branch that is behind; update with rebase on another (check the force-push)
3. Approve one waiting deployment and reject another, after the GitHub App has Deployments: write
4. Generate release notes; save a draft release; publish a release with a new tag (check the tag sits on the commit the card named, and "Latest")
5. Apply labels and an assignee on an issue; close an issue as a duplicate (check GitHub shows "duplicate of #n")
6. Whether GitHub accepts an empty comment on a deployment review, and whether a branch update that brings workflow file changes needs the app's Workflows permission
