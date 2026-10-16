import type {
	CardAction,
	GithubBranchView,
	GithubCiFailedView,
	GithubDeploymentView,
	GithubFailedJobView,
	GithubIssueView,
	GithubLabelView,
	GithubPersonView,
	GithubPullView,
	GithubReleaseView,
} from "../types";

/** Made-up people, words and ids, in the shapes the GitHub cards resolve to. */

export const REPO = "lumen-labs/app";
const WEB = `https://github.com/${REPO}`;

const person = (login: string): GithubPersonView => ({
	login,
	avatarUrl: null,
});
export const avery = person("avery-chen");
export const blake = person("blake-rivera");
export const casey = person("casey-nguyen");
export const riley = person("riley-morgan");
export const lena = person("lena-fischer");

export const HEAD_SHA = "9f2c41d7a8b35e6019c4d2f7ab83e5c61d0f4a72";

export const pull: GithubPullView = {
	repo: REPO,
	number: 482,
	title: "Sync queue: retry writes that lose the lease",
	url: `${WEB}/pull/482`,
	state: "open",
	draft: false,
	author: avery,
	head: "avery/sync-lease-retry",
	base: "main",
	sha: HEAD_SHA,
};

export const forkPull: GithubPullView = {
	...pull,
	number: 497,
	title: "Docs: explain the lease timeout",
	url: `${WEB}/pull/497`,
	author: casey,
	head: "casey-nguyen:docs-lease",
};

const action = (
	id: string,
	label: string,
	role: CardAction["role"],
	style: CardAction["style"] = "secondary",
	confirm?: string,
): CardAction => ({
	id,
	label,
	style,
	role,
	...(confirm ? { confirm } : {}),
});

const TEST_LOG = [
	"Run bun test --cwd packages/sync",
	"bun test v1.3.2",
	"",
	"src/queue/lease.test.ts:",
	"(pass) lease > is taken by the first writer [1.20ms]",
	"(pass) lease > is released when the writer ends [0.84ms]",
	"(pass) lease > expires after the timeout [12.41ms]",
	"",
	"src/queue/retry.test.ts:",
	"(pass) retry > backs off between attempts [3.02ms]",
	"(pass) retry > stops after five attempts [2.11ms]",
	"12 |   const queue = createQueue({ lease: 50 });",
	"13 |   await queue.write(entry);",
	"14 |   clock.tick(60);",
	"15 |   await queue.flush();",
	"16 |   expect(store.writes).toEqual([entry, entry]);",
	"                            ^",
	"error: expect(received).toEqual(expected)",
	"",
	'- [ { id: "e1", body: "first" }, { id: "e1", body: "first" } ]',
	'+ [ { id: "e1", body: "first" } ]',
	"",
	"      at <anonymous> (/home/runner/work/app/app/packages/sync/src/queue/retry.test.ts:16:24)",
	"(fail) retry > writes again when the lease is lost [61.77ms]",
	"",
	" 5 pass",
	" 1 fail",
	"Process completed with exit code 1.",
].join("\n");

export const testJob: GithubFailedJobView = {
	id: 30418822101,
	name: "Test",
	url: `${WEB}/actions/runs/11820044317/job/30418822101`,
	step: { number: 6, name: "Test" },
	errors: [
		"expect(received).toEqual(expected)",
		"Process completed with exit code 1.",
	],
	log: TEST_LOG,
	annotations: [
		{
			path: "packages/sync/src/queue/retry.test.ts",
			line: 16,
			message: "error: expect(received).toEqual(expected)",
		},
		{
			path: "packages/sync/src/queue/retry.ts",
			line: 48,
			message: "The retry does not run when the lease is lost before the flush",
		},
	],
};

export const lintJob: GithubFailedJobView = {
	id: 30418830455,
	name: "Lint",
	url: `${WEB}/actions/runs/11820044399/job/30418830455`,
	step: { number: 4, name: "Biome" },
	errors: ["Process completed with exit code 1."],
	log: [
		"Run bunx biome check .",
		"packages/sync/src/queue/retry.ts:48:9 lint/correctness/noUnusedVariables",
		"  × This variable attempt is unused.",
		"Checked 2114 files in 1982ms. No fixes applied.",
		"Found 1 error.",
		"Process completed with exit code 1.",
	].join("\n"),
	annotations: [],
};

const ciRun = {
	id: 11820044317,
	name: "CI #1204",
	attempt: 1,
	running: false,
	url: `${WEB}/actions/runs/11820044317`,
	jobs: [testJob],
};

const FIX = {
	slug: "app-482-ci",
	title: `Fix CI on ${REPO}#482`,
	prompt: `Fix the failing checks on ${REPO}#482 "${pull.title}" (branch ${pull.head}, ${pull.url}).`,
};

export const RERUN_FAILED_CONFIRM = `Re-run the failed jobs of CI #1204 on ${REPO}#482?`;
export const RERUN_ALL_CONFIRM = `Re-run all jobs of CI #1204 on ${REPO}#482?`;

export const ciActions: CardAction[] = [
	action(
		"rerun_failed",
		"Re-run failed jobs",
		"primary",
		"primary",
		RERUN_FAILED_CONFIRM,
	),
	action(
		"rerun_all",
		"Re-run all jobs",
		"other",
		"secondary",
		RERUN_ALL_CONFIRM,
	),
	action("started", "Start an agent to fix it", "other"),
	action("dismiss", "Leave it", "dismiss"),
];

export const ciView: GithubCiFailedView = {
	kind: "github.ci_failed",
	pull,
	runs: [ciRun],
	others: [],
	omitted: 0,
	total: 14,
	failing: 1,
	pending: 0,
	fix: FIX,
};

export const ciTwoRunsView: GithubCiFailedView = {
	...ciView,
	runs: [
		{ ...ciRun, attempt: 2 },
		{
			id: 11820044399,
			name: "Lint #877",
			attempt: 1,
			running: false,
			url: `${WEB}/actions/runs/11820044399`,
			jobs: [lintJob],
		},
	],
	others: [
		{ name: "Vercel – app", url: "https://vercel.example/lumen-labs/app" },
	],
	failing: 3,
	pending: 2,
};

export const ciExternalOnlyView: GithubCiFailedView = {
	...ciView,
	runs: [],
	others: [
		{ name: "Vercel – app", url: "https://vercel.example/lumen-labs/app" },
		{ name: "license/cla", url: null },
	],
	failing: 2,
};

export const NO_FAILED_JOB = "No failed Actions job to re-run";
export const CI_STILL_RUNNING = "CI #1204 is still running";

export const ciPassingView: GithubCiFailedView = {
	...ciView,
	runs: [],
	failing: 0,
};

const commit = (sha: string, message: string, author: string | null) => ({
	sha,
	message,
	author,
});

const MISSING = [
	commit(
		"4be19c07d2a6f38815e0c7b94a1d3f6258ce70b1",
		"Queue: drop entries older than the retention window (#479)",
		"Blake Rivera",
	),
	commit(
		"c07a5512e9d4b6f03a18c2e7d95b4f6a1083ce29",
		"Desktop: keep the sidebar width across restarts (#476)",
		"Casey Nguyen",
	),
	commit(
		"1d86f3a09b27c45e8f10a6d3c2b794e5f06a13d8",
		"Bump bun to 1.3.2 (#474)",
		"Riley Morgan",
	),
];

export const BRANCH_PLAN = {
	merge: `Merge main into ${pull.head} on ${REPO}#482?`,
	rebase: `Rebase ${pull.head} onto main and force-push it on ${REPO}#482?`,
};

export const branchActions: CardAction[] = [
	action("update", "Update branch", "primary", "primary"),
	action("started", "Rebase with an agent", "other"),
	action("dismiss", "Leave it", "dismiss"),
];

export const branchView: GithubBranchView = {
	kind: "github.branch",
	pull,
	state: "behind",
	behindBy: 3,
	aheadBy: 5,
	missing: MISSING,
	plan: BRANCH_PLAN,
	fix: {
		slug: "app-482-rebase",
		title: `Rebase ${pull.head} onto main (${REPO}#482)`,
		prompt: `Rebase ${pull.head} onto main for ${REPO}#482 "${pull.title}" (${pull.url}).`,
	},
};

export const BRANCH_CONFLICTS = `${pull.head} conflicts with main. Resolve it with an agent or on your machine`;
export const BRANCH_COMPUTING =
	"GitHub is still checking this branch. Try again in a moment";
export const BRANCH_CURRENT = "Already up to date with main";
export const FORK_NO_PUSH = "This branch is in a fork you cannot push to";

export const branchConflictsView: GithubBranchView = {
	...branchView,
	state: "conflicts",
};
export const branchConflictsActions: CardAction[] = [
	{
		...action("update", "Update branch", "primary", "primary"),
		disabled: BRANCH_CONFLICTS,
	},
	action("started", "Resolve with an agent", "other"),
	action("dismiss", "Leave it", "dismiss"),
];
export const branchComputingView: GithubBranchView = {
	...branchView,
	state: "computing",
	behindBy: 0,
	missing: [],
};
export const branchCurrentView: GithubBranchView = {
	...branchView,
	state: "current",
	behindBy: 0,
	missing: [],
};
export const branchManyBehindView: GithubBranchView = {
	...branchView,
	behindBy: 41,
};
export const branchForkView: GithubBranchView = {
	...branchView,
	pull: forkPull,
	plan: {
		merge: `Merge main into ${forkPull.head} on ${REPO}#497?`,
		rebase: `Rebase ${forkPull.head} onto main and force-push it on ${REPO}#497?`,
	},
};

const RUN_TITLE = "Release desktop 2.4.0";
const RUN_WHAT = `Deploy #318 (release/2.4.0 at 9f2c41d) on ${REPO}`;

export const production: GithubDeploymentView["environments"][number] = {
	id: 5120011,
	name: "production",
	url: `${WEB}/deployments/production`,
	waitTimer: 0,
	canApprove: true,
	reviewers: [
		{ kind: "user", name: riley.login, avatarUrl: null },
		{ kind: "team", name: "release-managers", avatarUrl: null },
	],
};
export const staging: GithubDeploymentView["environments"][number] = {
	id: 5120012,
	name: "staging",
	url: `${WEB}/deployments/staging`,
	waitTimer: 0,
	canApprove: true,
	reviewers: [{ kind: "user", name: riley.login, avatarUrl: null }],
};
export const appStore: GithubDeploymentView["environments"][number] = {
	id: 5120013,
	name: "app-store",
	url: null,
	waitTimer: 0,
	canApprove: false,
	reviewers: [{ kind: "user", name: blake.login, avatarUrl: null }],
};

export const deploymentActions: CardAction[] = [
	action("approve", "Approve and deploy", "primary", "primary"),
	action("reject", "Reject", "other", "danger"),
	action("dismiss", "Leave it", "dismiss"),
];

export const deploymentView: GithubDeploymentView = {
	kind: "github.deployment",
	repo: REPO,
	run: {
		id: 11833019276,
		name: "Deploy #318",
		title: RUN_TITLE,
		url: `${WEB}/actions/runs/11833019276`,
		branch: "release/2.4.0",
		sha: HEAD_SHA,
		event: "workflow_dispatch",
		actor: avery,
		status: "waiting",
	},
	environments: [production],
	plan: {
		approve: `Approve the deployment to {environments} of ${RUN_WHAT}?`,
		reject: `Reject the deployment to {environments} of ${RUN_WHAT}?`,
	},
};

export const deploymentTwoView: GithubDeploymentView = {
	...deploymentView,
	environments: [staging, production],
};
export const deploymentMixedView: GithubDeploymentView = {
	...deploymentView,
	environments: [production, appStore],
};
export const deploymentTimerView: GithubDeploymentView = {
	...deploymentView,
	environments: [{ ...production, waitTimer: 15 }],
};
export const NOTHING_WAITING = "Nothing on this run is waiting for approval";
export const deploymentNoneView: GithubDeploymentView = {
	...deploymentView,
	run: { ...deploymentView.run, status: "completed" },
	environments: [],
};
export const deploymentNoneActions: CardAction[] = deploymentActions.map(
	(each) =>
		each.id === "dismiss" ? each : { ...each, disabled: NOTHING_WAITING },
);

const RELEASE_COMMITS = [
	commit(
		"9f2c41d7a8b35e6019c4d2f7ab83e5c61d0f4a72",
		"Sync queue: retry writes that lose the lease (#482)",
		"avery-chen",
	),
	commit(
		"4be19c07d2a6f38815e0c7b94a1d3f6258ce70b1",
		"Queue: drop entries older than the retention window (#479)",
		"blake-rivera",
	),
	commit(
		"c07a5512e9d4b6f03a18c2e7d95b4f6a1083ce29",
		"Desktop: keep the sidebar width across restarts (#476)",
		"casey-nguyen",
	),
	commit(
		"1d86f3a09b27c45e8f10a6d3c2b794e5f06a13d8",
		"Bump bun to 1.3.2 (#474)",
		"riley-morgan",
	),
	commit(
		"73a0c9e1f5b2d4680a3c7e19d6b8f2054c1e9a37",
		"Search: match file names before file contents (#471)",
		"lena-fischer",
	),
	commit(
		"e2d5b804c1f7a39620d8e4b1c5a7936f0d2b8c14",
		"Fix the crash when a pane closes while it loads (#468)",
		"avery-chen",
	),
	commit(
		"a6194f3d0c8e2b75f1a9d4063e7c5b28190fd4e6",
		"Settings: move the theme picker to Appearance (#465)",
		"casey-nguyen",
	),
	commit(
		"0c3e7a92b6d1f4580e9a2c7d5b1f806349ae7d25",
		"Docs: how the sync lease works (#462)",
		"lena-fischer",
	),
];

const COMPARE = `${WEB}/compare/v2.3.1...main`;

export const RELEASE_NOTES = [
	"## What's changed",
	...RELEASE_COMMITS.map((each) => `- ${each.message}`),
	"",
	`**Full changelog**: ${COMPARE}`,
].join("\n");

export const GENERATED_NOTES = [
	"## What's Changed",
	"* Sync queue: retry writes that lose the lease by @avery-chen in #482",
	"* Queue: drop entries older than the retention window by @blake-rivera in #479",
	"",
	`**Full Changelog**: ${COMPARE}`,
].join("\n");

const RELEASE_TAILS = {
	latest: " It becomes the latest release.",
	prerelease: " It is marked as a pre-release.",
};
export const REPLACE_NOTES = "Replace the notes with GitHub's?";

export const releaseActions: CardAction[] = [
	action("publish", "Publish release", "primary", "primary"),
	action("draft", "Save draft", "other"),
	action("generate", "Generate release notes", "other"),
	action("dismiss", "Do not release", "dismiss"),
];

export const releaseView: GithubReleaseView = {
	kind: "github.release",
	repo: REPO,
	tag: "v2.4.0",
	tagExists: false,
	target: "main",
	sha: HEAD_SHA,
	name: "v2.4.0",
	notes: RELEASE_NOTES,
	prerelease: false,
	latest: true,
	existing: null,
	previous: { tag: "v2.3.1", url: `${WEB}/releases/tag/v2.3.1` },
	commits: RELEASE_COMMITS,
	total: 8,
	compareUrl: COMPARE,
	plan: {
		publish: `Publish the release "{name}" on ${REPO}, with the new tag v2.4.0 on main at 9f2c41d?`,
		draft: `Save "{name}" as a draft release on ${REPO}, with the new tag v2.4.0 on main at 9f2c41d? Nothing is published.`,
		...RELEASE_TAILS,
		generate: null,
	},
};

/** The agent wrote the notes, so GitHub's would replace them. */
export const releaseDraftedNotesView: GithubReleaseView = {
	...releaseView,
	plan: { ...releaseView.plan, generate: REPLACE_NOTES },
};

export const releaseExistingTagView: GithubReleaseView = {
	...releaseView,
	tagExists: true,
	target: "v2.4.0",
	plan: {
		publish: `Publish the release "{name}" on ${REPO}, tagged v2.4.0 at 9f2c41d?`,
		draft: `Save "{name}" as a draft release on ${REPO}, tagged v2.4.0 at 9f2c41d? Nothing is published.`,
		...RELEASE_TAILS,
		generate: null,
	},
};
export const releasePrereleaseView: GithubReleaseView = {
	...releaseView,
	tag: "v2.4.0-rc.1",
	name: "v2.4.0 release candidate 1",
	prerelease: true,
	total: 37,
};
export const ALREADY_RELEASED = "v2.4.0 is already released";
export const releasedView: GithubReleaseView = {
	...releaseExistingTagView,
	existing: { url: `${WEB}/releases/tag/v2.4.0`, draft: false },
};
export const releasedActions: CardAction[] = releaseActions.flatMap((each) =>
	each.id === "generate"
		? []
		: each.id === "dismiss"
			? [each]
			: [{ ...each, disabled: ALREADY_RELEASED }],
);

const label = (
	name: string,
	color: string,
	description: string | null = null,
): GithubLabelView => ({ name, color, description });

export const bug = label("bug", "d73a4a", "Something isn't working");
export const regression = label(
	"regression",
	"b60205",
	"Worked in an earlier release",
);
export const areaSync = label(
	"area: sync",
	"1d76db",
	"The sync queue and its storage",
);
export const p1 = label("priority: high", "e99695", "Fix in the next release");
export const needsTriage = label(
	"needs triage",
	"fbca04",
	"Nobody has looked at this yet",
);

export const labelOptions: GithubLabelView[] = [
	areaSync,
	label("area: desktop", "0e8a16", "The desktop app"),
	label("area: mobile", "5319e7", "The mobile app"),
	bug,
	label(
		"documentation",
		"0075ca",
		"Improvements or additions to documentation",
	),
	label("duplicate", "cfd3d7", "This issue or pull request already exists"),
	label("enhancement", "a2eeef", "New feature or request"),
	label("good first issue", "7057ff", "Good for newcomers"),
	needsTriage,
	p1,
	label("question", "d876e3"),
	regression,
];

export const ISSUE_BODY = [
	"### What happened",
	"",
	"After the laptop wakes from sleep the sync queue writes the same entry twice. The second write shows up as a duplicate row in the activity list.",
	"",
	"### Steps",
	"",
	"1. Open a workspace and make a change",
	"2. Close the lid for more than a minute",
	"3. Open it and wait for the sync",
	"",
	"### Expected",
	"",
	"One row per change.",
	"",
	"### Version",
	"",
	"`2.3.1` on macOS 26. It did not happen on `2.2.4`.",
	"",
	"```",
	"[sync] lease lost for e1, retrying",
	"[sync] wrote e1",
	"[sync] wrote e1",
	"```",
].join("\n");

export const issueActions: CardAction[] = [
	action("apply", "Apply", "primary", "primary"),
	action("dismiss", "Leave it", "dismiss"),
];

export const issueView: GithubIssueView = {
	kind: "github.issue",
	repo: REPO,
	issue: {
		number: 511,
		title: "Sync writes an entry twice after the laptop wakes",
		body: ISSUE_BODY,
		url: `${WEB}/issues/511`,
		state: "open",
		author: casey,
		createdAt: "2037-09-28T12:00:00Z",
		comments: 3,
		labels: [needsTriage],
		assignees: [],
	},
	options: {
		labels: labelOptions,
		assignees: [avery, blake, casey, lena, riley],
	},
	suggested: {
		labels: [bug.name, areaSync.name],
		assignees: [avery.login],
	},
	duplicate: null,
	plan: {
		lead: `On ${REPO}#511: `,
		addLabels: "add labels {names}",
		removeLabels: "remove labels {names}",
		assign: "assign {names}",
		unassign: "unassign {names}",
	},
};

export const issueNoSuggestionView: GithubIssueView = {
	...issueView,
	issue: { ...issueView.issue, labels: [bug, areaSync], assignees: [avery] },
	suggested: { labels: [], assignees: [] },
};

export const DUPLICATE = {
	number: 498,
	title: "Duplicate rows in the activity list after sleep",
	url: `${WEB}/issues/498`,
	state: "open" as const,
};
export const CLOSE_DUPLICATE_CONFIRM = `Close ${REPO}#511 as a duplicate of #498 "${DUPLICATE.title}"?`;

export const issueDuplicateView: GithubIssueView = {
	...issueView,
	duplicate: DUPLICATE,
};
export const issueDuplicateActions: CardAction[] = [
	action("apply", "Apply", "primary", "primary"),
	action(
		"close_duplicate",
		"Close as duplicate",
		"other",
		"secondary",
		CLOSE_DUPLICATE_CONFIRM,
	),
	action("dismiss", "Leave it", "dismiss"),
];

export const CANNOT_TRIAGE = `Your GitHub account cannot triage issues on ${REPO}`;
export const ALREADY_CLOSED = "Already closed";

export const issueClosedView: GithubIssueView = {
	...issueDuplicateView,
	issue: { ...issueView.issue, state: "closed" },
};
export const issueClosedActions: CardAction[] = issueDuplicateActions.map(
	(each) =>
		each.id === "close_duplicate"
			? { ...each, disabled: ALREADY_CLOSED }
			: each,
);
