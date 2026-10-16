import type { RouterOutputs } from "@superset/trpc";
import type { CardAction, CardViewOf } from "../types";
import type { SupersetWorkspaceView } from "./SupersetWorkspace";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type AskBlockData = Extract<DocumentBlocks[number], { type: "ask" }>;

type AgentFinishedView = CardViewOf<"superset.agent_finished">;
type AgentNeedsView = CardViewOf<"superset.agent_needs">;
type PrReviewView = CardViewOf<"superset.pr_review">;
type TaskAssignedView = CardViewOf<"superset.task_assigned">;
type AutomationFailedView = CardViewOf<"superset.automation_failed">;
type PullRequestView = PrReviewView["pullRequest"];
type ReviewThreadView = PrReviewView["threads"][number];
type ReviewCommentView = ReviewThreadView["comments"][number];
type PersonView = NonNullable<SupersetWorkspaceView["createdBy"]>;

/** A made-up organization, "Lumen Labs". Every person, repository and workspace is invented. Times are counted back from now, so a story reads "2 days ago" on any day; the test kit fixes the clock before it loads this file. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const REPO = "lumen-labs/app";
const WEB = `https://github.com/${REPO}`;

const person = (id: string, name: string): PersonView => ({
	id,
	name,
	image: null,
});
export const mira = person("user_mira", "Mira Okafor");
export const jonas = person("user_jonas", "Jonas Lind");
export const priya = person("user_priya", "Priya Raman");
export const tomas = person("user_tomas", "Tomas Vega");

/** The reader in every fixture. */
export const VIEWER_ID = mira.id;
export const LOCAL_HOST_ID = "host-mira-mbp";

export const LONG_NAME =
	"Rework the sync queue so that a write which loses its lease is retried with backoff instead of dropped, and report every retry to the telemetry pipeline";
export const LONG_BRANCH =
	"mira/rework-the-sync-queue-so-that-a-write-which-loses-its-lease-is-retried-with-backoff-instead-of-dropped-and-reported";

const checks: PullRequestView["checks"] = [
	{ name: "Typecheck", status: "success", url: `${WEB}/actions/runs/9101` },
	{ name: "Test", status: "failure", url: `${WEB}/actions/runs/9102` },
	{ name: "Lint", status: "pending", url: null },
	{ name: "Deploy preview", status: "skipped", url: null },
];

/** As the workspace's host reports it: no diff stats of its own. */
export const hostPullRequest: PullRequestView = {
	repo: REPO,
	number: 482,
	title: "Sync queue: retry writes that lose the lease",
	url: `${WEB}/pull/482`,
	state: "open",
	isDraft: false,
	additions: null,
	deletions: null,
	changedFiles: null,
	checksStatus: "success",
	checks: [
		{ name: "Typecheck", status: "success", url: `${WEB}/actions/runs/9101` },
		{ name: "Test", status: "success", url: `${WEB}/actions/runs/9102` },
	],
	reviewDecision: "APPROVED",
};

/** As GitHub's webhooks report it: diff stats, a failing check, changes requested. */
export const cloudPullRequest: PullRequestView = {
	repo: REPO,
	number: 497,
	title: "Billing: show the next invoice date on the plan page",
	url: `${WEB}/pull/497`,
	state: "open",
	isDraft: false,
	additions: 212,
	deletions: 48,
	changedFiles: 11,
	checksStatus: "failure",
	checks,
	reviewDecision: "CHANGES_REQUESTED",
};

export const draftPullRequest: PullRequestView = {
	...cloudPullRequest,
	number: 503,
	title: "Draft: move the invoice job to the queue",
	url: `${WEB}/pull/503`,
	isDraft: true,
	checksStatus: "pending",
	checks: [{ name: "Test", status: "pending", url: null }],
	reviewDecision: "REVIEW_REQUIRED",
};

export const mergedPullRequest: PullRequestView = {
	...cloudPullRequest,
	state: "merged",
	checksStatus: "success",
	checks: checks.map((check) => ({ ...check, status: "success" })),
	reviewDecision: "APPROVED",
};

export const localWorkspace: SupersetWorkspaceView = {
	id: "5b0c1f0e-6a51-4a7e-9d5b-1f2a3c4d5e01",
	location: "local",
	name: "Retry writes that lose the lease",
	branch: "mira/sync-lease-retry",
	repo: REPO,
	status: null,
	agentStatus: null,
	agentStatusAt: null,
	createdAt: ago(2 * DAY),
	createdBy: mira,
	host: { id: LOCAL_HOST_ID, name: "Mira's MacBook Pro" },
	presence: [],
	pullRequest: hostPullRequest,
	changes: { additions: 184, deletions: 37, files: 9 },
};

/** On a teammate's machine, reached through the relay. */
export const remoteWorkspace: SupersetWorkspaceView = {
	...localWorkspace,
	id: "5b0c1f0e-6a51-4a7e-9d5b-1f2a3c4d5e02",
	name: "Lease timeout docs",
	branch: "jonas/docs-lease-timeout",
	createdBy: jonas,
	host: { id: "host-jonas-studio", name: "Jonas's Mac Studio" },
	pullRequest: null,
	changes: { additions: 42, deletions: 3, files: 2 },
};

export const localNoPullRequestWorkspace: SupersetWorkspaceView = {
	...localWorkspace,
	id: "5b0c1f0e-6a51-4a7e-9d5b-1f2a3c4d5e03",
	name: "Try a smaller retry window",
	branch: "mira/smaller-retry-window",
	pullRequest: null,
	changes: { additions: 12, deletions: 4, files: 1 },
};

/** The host did not answer for its git status. */
export const localNoChangesWorkspace: SupersetWorkspaceView = {
	...localNoPullRequestWorkspace,
	id: "5b0c1f0e-6a51-4a7e-9d5b-1f2a3c4d5e04",
	changes: null,
};

export const cloudWorkspace: SupersetWorkspaceView = {
	id: "8d2e4a6c-1b3f-4c5d-8e7f-a1b2c3d4e501",
	location: "cloud",
	name: "Next invoice date on the plan page",
	branch: "agent/next-invoice-date",
	repo: REPO,
	status: "ready",
	agentStatus: "review",
	agentStatusAt: ago(20 * MINUTE),
	createdAt: ago(4 * HOUR),
	createdBy: mira,
	host: null,
	presence: [
		{ ...jonas, lastSeenAt: ago(2 * MINUTE) },
		{ ...priya, lastSeenAt: ago(34 * HOUR) },
	],
	pullRequest: cloudPullRequest,
	changes: { additions: 212, deletions: 48, files: 11 },
};

export const cloudNoPullRequestWorkspace: SupersetWorkspaceView = {
	...cloudWorkspace,
	id: "8d2e4a6c-1b3f-4c5d-8e7f-a1b2c3d4e502",
	name: "Look into the slow plan page",
	branch: "agent/slow-plan-page",
	createdBy: jonas,
	presence: [],
	pullRequest: null,
	changes: null,
};

export const cloudWorkingWorkspace: SupersetWorkspaceView = {
	...cloudWorkspace,
	id: "8d2e4a6c-1b3f-4c5d-8e7f-a1b2c3d4e503",
	name: "Move the invoice job to the queue",
	branch: "agent/invoice-job-queue",
	agentStatus: "working",
	createdBy: priya,
	presence: [
		{ ...mira, lastSeenAt: ago(MINUTE) },
		{ ...jonas, lastSeenAt: ago(2 * MINUTE) },
		{ ...priya, lastSeenAt: ago(3 * MINUTE) },
		{ ...tomas, lastSeenAt: ago(10 * MINUTE) },
	],
	pullRequest: draftPullRequest,
};

export const cloudMergedWorkspace: SupersetWorkspaceView = {
	...cloudWorkspace,
	id: "8d2e4a6c-1b3f-4c5d-8e7f-a1b2c3d4e504",
	agentStatus: null,
	agentStatusAt: null,
	presence: [],
	pullRequest: mergedPullRequest,
};

export const longLocalWorkspace: SupersetWorkspaceView = {
	...localWorkspace,
	id: "5b0c1f0e-6a51-4a7e-9d5b-1f2a3c4d5e05",
	name: LONG_NAME,
	branch: LONG_BRANCH,
	pullRequest: {
		...hostPullRequest,
		title: `${LONG_NAME}, part one of three`,
	},
	changes: { additions: 12840, deletions: 9321, files: 214 },
};

export const longCloudWorkspace: SupersetWorkspaceView = {
	...cloudWorkingWorkspace,
	id: "8d2e4a6c-1b3f-4c5d-8e7f-a1b2c3d4e505",
	name: LONG_NAME,
	branch: LONG_BRANCH,
	pullRequest: {
		...cloudPullRequest,
		title: `${LONG_NAME}, part one of three`,
		additions: 12840,
		deletions: 9321,
		changedFiles: 214,
	},
	changes: { additions: 12840, deletions: 9321, files: 214 },
};

const off = (actions: CardAction[], id: string, reason: string): CardAction[] =>
	actions.map((action) =>
		action.id === id ? { ...action, disabled: reason } : action,
	);

export const ARCHIVE_CONFIRM =
	"The cloud workspace stops now. It can be restored for 7 days, then it is deleted.";
export const ALREADY_ARCHIVED = "That workspace is already archived";
export const FEEDBACK_INPUT = "What the agent should do next";

const sendBack: CardAction = {
	id: "send_back",
	label: "Send back",
	style: "primary",
	role: "primary",
	input: FEEDBACK_INPUT,
};

export const finishedLocalActions: CardAction[] = [sendBack];
export const finishedCloudActions: CardAction[] = [
	sendBack,
	{
		id: "archive",
		label: "Archive workspace",
		style: "secondary",
		role: "other",
		confirm: ARCHIVE_CONFIRM,
	},
];
export const finishedArchivedActions = off(
	finishedCloudActions,
	"archive",
	ALREADY_ARCHIVED,
);

const finished = (workspace: SupersetWorkspaceView): AgentFinishedView => ({
	kind: "superset.agent_finished",
	workspace,
});
export const finishedLocalView = finished(localWorkspace);
export const finishedCloudView = finished(cloudWorkspace);
export const finishedNoPullRequestView = finished(localNoPullRequestWorkspace);
export const finishedCloudNoPullRequestView = finished(
	cloudNoPullRequestWorkspace,
);
export const finishedMergedView = finished(cloudMergedWorkspace);
export const finishedLongLocalView = finished(longLocalWorkspace);
export const finishedLongCloudView = finished(longCloudWorkspace);

export const INSTEAD_INPUT = "Tell the agent what to do instead";

export const credentialActions = (service: string): CardAction[] => [
	{
		id: "connected",
		label: `I connected ${service}`,
		style: "primary",
		role: "primary",
	},
	{
		id: "declined",
		label: "Not granting this",
		style: "secondary",
		role: "dismiss",
		input: INSTEAD_INPUT,
	},
];
export const toolActions = (tool: string): CardAction[] => [
	{ id: "approve", label: `Allow ${tool}`, style: "primary", role: "primary" },
	{
		id: "deny",
		label: "Don't allow",
		style: "secondary",
		role: "dismiss",
		input: INSTEAD_INPUT,
	},
];

export const credentialView: AgentNeedsView = {
	kind: "superset.agent_needs",
	need: "credential",
	workspace: cloudWorkingWorkspace,
	service: { id: "github", label: "GitHub" },
	scope: "repo, read:org",
	tool: null,
	questionId: null,
};

/** A service the app has no mark for, and no scope. */
export const otherCredentialView: AgentNeedsView = {
	...credentialView,
	workspace: null,
	service: { id: "other", label: "another service" },
	scope: null,
};

export const toolView: AgentNeedsView = {
	kind: "superset.agent_needs",
	need: "tool",
	workspace: localWorkspace,
	service: null,
	scope: null,
	tool: "gh pr merge",
	questionId: null,
};

export const toolNoWorkspaceView: AgentNeedsView = {
	...toolView,
	workspace: null,
};

export const questionView: AgentNeedsView = {
	kind: "superset.agent_needs",
	need: "question",
	workspace: cloudWorkingWorkspace,
	service: null,
	scope: null,
	tool: null,
	questionId: "retry-window",
};

/** The ask question the question card answers, as the document carries it. */
export const retryWindowAsk: AskBlockData = {
	id: "retry-window",
	type: "ask",
	ask: {
		questions: [
			{
				id: "retry-window",
				kind: "select",
				prompt: "How long should the queue keep retrying a write?",
				options: [
					{
						id: "30s",
						label: "30 seconds",
						consequence: "A short outage drops writes.",
					},
					{
						id: "5m",
						label: "5 minutes",
						consequence:
							"Rides out a deploy. Callers wait longer for an error.",
					},
				],
			},
		],
	},
};

export const longCredentialView: AgentNeedsView = {
	...credentialView,
	workspace: longCloudWorkspace,
	scope:
		"repo,read:org,workflow,write:packages,read:packages,admin:repo_hook,read:discussion,project,read:enterprise,admin:org_hook",
};

export const longToolView: AgentNeedsView = {
	...toolView,
	workspace: longLocalWorkspace,
	tool: "gh pr merge --squash --delete-branch --subject sync-queue-retry-writes-that-lose-the-lease --repo lumen-labs/app 482",
};

const comment = (
	n: number,
	login: string,
	body: string,
	createdAt: string,
	pr: PullRequestView,
): ReviewCommentView => ({
	id: String(2_000_000 + n),
	author: { login, avatarUrl: null },
	body,
	createdAt,
	url: `${pr.url}#discussion_r${2_000_000 + n}`,
});

export const retryThread: ReviewThreadView = {
	id: "PRRT_fixture_retry",
	path: "packages/sync/src/queue/retry.ts",
	line: 48,
	outdated: false,
	comments: [
		comment(
			1,
			"jonas-lind",
			"This retries forever when the lease never comes back. Cap it at five attempts?",
			ago(110 * MINUTE),
			cloudPullRequest,
		),
	],
};

export const backoffThread: ReviewThreadView = {
	id: "PRRT_fixture_backoff",
	path: "packages/sync/src/queue/backoff.ts",
	line: 12,
	outdated: false,
	comments: [
		comment(
			2,
			"priya-raman",
			"The jitter is added after the cap, so a delay can pass `MAX_DELAY_MS`.",
			ago(98 * MINUTE),
			cloudPullRequest,
		),
		comment(
			3,
			"jonas-lind",
			"Agreed. Clamp once, at the end.",
			ago(89 * MINUTE),
			cloudPullRequest,
		),
	],
};

export const outdatedThread: ReviewThreadView = {
	id: "PRRT_fixture_outdated",
	path: "packages/sync/src/queue/lease.ts",
	line: null,
	outdated: true,
	comments: [
		comment(
			4,
			"tomas-vega",
			"`acquire` can throw here and the queue never hears about it.",
			ago(32 * HOUR),
			cloudPullRequest,
		),
	],
};

const longThread = (n: number): ReviewThreadView => ({
	id: `PRRT_fixture_long_${n}`,
	path: `packages/sync/src/queue/a-very-long-directory-name-for-generated-clients/and-another-level-of-nesting/and-one-more/handler-${n}.generated.ts`,
	line: 100 + n,
	outdated: n % 3 === 0,
	comments: [
		comment(
			10 + n,
			"jonas-lind",
			`This call is not awaited. See https://github.com/${REPO}/blob/main/packages/sync/src/queue/a-very-long-directory-name-for-generated-clients/handler-${n}.generated.ts#L${100 + n} for the one that is.`,
			ago(80 * MINUTE),
			cloudPullRequest,
		),
	],
});

const review = (
	workspace: SupersetWorkspaceView,
	threads: ReviewThreadView[],
): PrReviewView => ({
	kind: "superset.pr_review",
	workspace,
	pullRequest: workspace.pullRequest as PullRequestView,
	threads,
});

export const reviewOneThreadView = review(cloudWorkspace, [retryThread]);
export const reviewView = review(cloudWorkspace, [retryThread, backoffThread]);
export const reviewOutdatedView = review(cloudWorkspace, [
	retryThread,
	outdatedThread,
]);
export const reviewNoThreadsView = review(cloudWorkspace, []);
export const reviewLocalView = review(localWorkspace, [retryThread]);
export const reviewDraftView = review(cloudWorkingWorkspace, [backoffThread]);
export const reviewLongView = review(
	longCloudWorkspace,
	[1, 2, 3, 4, 5, 6, 7, 8].map(longThread),
);

export const NOTE_INPUT = "Anything the agent should know";
export const NO_OPEN_THREAD = "No review thread is open";

export const reviewActions: CardAction[] = [
	{ id: "reply", label: "Reply", style: "secondary", role: "other" },
	{ id: "resolve", label: "Resolve", style: "secondary", role: "other" },
	{
		id: "address",
		label: "Address with agent",
		style: "primary",
		role: "primary",
		input: NOTE_INPUT,
	},
];
export const reviewNoThreadsActions = off(
	reviewActions,
	"address",
	NO_OPEN_THREAD,
);

export const task: TaskAssignedView["task"] = {
	id: "c3a1b2d4-0e5f-4a6b-9c7d-112233445501",
	slug: "LUM-214",
	title: "Retry writes that lose the lease",
	description:
		"Writes that lose the lease are dropped today.\n\nRetry them with backoff, at most five times, and count each retry.",
	priority: "high",
	status: { name: "Todo", color: "#8b8d98", type: "unstarted" },
	assignee: mira,
	creator: jonas,
	branch: null,
	dueDate: null,
	labels: [],
};

const LONG_DESCRIPTION = [
	"## What happens",
	"",
	"A write that loses its lease is dropped. The caller is told the write went through, and the row never reaches the replica.",
	"",
	"## What we want",
	"",
	"- Retry the write with backoff, at most five times",
	"- Count each retry in telemetry as `sync.queue.retry`",
	"- Give up with an error the caller can see",
	"",
	"```ts",
	"await queue.write(row, { retry: { attempts: 5, backoff: 'exponential', maxDelayMs: 30_000, jitter: true } });",
	"```",
	"",
	"See https://github.com/lumen-labs/app/blob/main/packages/sync/src/queue/a-very-long-directory-name-for-generated-clients/retry.ts for the current code.",
	"",
	"The lease timeout is documented in the runbook. Ask Jonas before changing it, because the replica reads it as well.",
].join("\n");

export const taskAssignedView: TaskAssignedView = {
	kind: "superset.task_assigned",
	task,
	workspaces: [],
};

export const taskWithWorkspacesView: TaskAssignedView = {
	...taskAssignedView,
	task: {
		...task,
		status: { name: "In progress", color: "#f2c94c", type: "started" },
	},
	workspaces: [cloudWorkingWorkspace, cloudNoPullRequestWorkspace],
};

export const taskDetailedView: TaskAssignedView = {
	...taskAssignedView,
	task: {
		...task,
		priority: "urgent",
		description: LONG_DESCRIPTION,
		dueDate: ago(-8 * DAY),
		labels: [
			{ name: "sync", color: "#5e6ad2" },
			{ name: "bug", color: "#eb5757" },
			{ name: "no color", color: null },
		],
	},
};

/** Synced from Linear: its key replaces the slug, and the assignee has no avatar. */
export const taskBareView: TaskAssignedView = {
	...taskAssignedView,
	task: {
		...task,
		branch: "mira/agt-31-retry-writes",
		priority: "none",
		description: null,
		assignee: null,
	},
};

export const taskLongView: TaskAssignedView = {
	...taskDetailedView,
	task: {
		...taskDetailedView.task,
		title: LONG_NAME,
		labels: [
			...taskDetailedView.task.labels,
			{
				name: "a-very-long-label-name-for-the-generated-clients",
				color: "#27ae60",
			},
			{ name: "needs-design", color: "#f2994a" },
			{ name: "customer-reported", color: "#bb6bd9" },
		],
	},
	workspaces: [longCloudWorkspace],
};

export const taskActions: CardAction[] = [
	{ id: "started", label: "I started it", style: "primary", role: "primary" },
];

const AUTOMATION_ID = "a7b8c9d0-1e2f-4a3b-8c4d-556677889901";
const RUN_ID = "f1e2d3c4-b5a6-4978-8a9b-00aa11bb2201";

const automation: AutomationFailedView["automation"] = {
	id: AUTOMATION_ID,
	name: "Triage new Sentry issues",
	agent: "claude",
	target: { kind: "host", name: "Mira's MacBook Pro" },
};

export const failedSession = {
	location: "local",
	workspaceId: localWorkspace.id,
	terminalId: "term_fixture_failed",
} as const;
export const laterCloudSession = {
	location: "cloud",
	workspaceId: cloudWorkspace.id,
} as const;

export const automationFailedView: AutomationFailedView = {
	kind: "superset.automation_failed",
	automation,
	run: {
		id: RUN_ID,
		title: "Triage new Sentry issues",
		status: "dispatch_failed",
		error: 'Agent "triage-bot" was not found on host-mira-mbp',
		errorCode: "agent_not_found",
		createdAt: ago(6 * HOUR - 3 * MINUTE),
		scheduledFor: ago(6 * HOUR),
		session: failedSession,
	},
	later: [],
};

/** The schedule came due with no host online: nothing ran, so there is no session to open. */
export const automationSkippedView: AutomationFailedView = {
	...automationFailedView,
	run: {
		...automationFailedView.run,
		title: null,
		status: "skipped_offline",
		error: null,
		errorCode: "host_offline",
		scheduledFor: null,
		session: null,
	},
};

export const automationRecoveredView: AutomationFailedView = {
	...automationFailedView,
	later: [
		{
			id: "f1e2d3c4-b5a6-4978-8a9b-00aa11bb2203",
			status: "dispatched",
			createdAt: ago(4 * HOUR),
			session: laterCloudSession,
		},
		{
			id: "f1e2d3c4-b5a6-4978-8a9b-00aa11bb2202",
			status: "skipped_offline",
			createdAt: ago(5 * HOUR),
			session: null,
		},
	],
};

export const automationCloudView: AutomationFailedView = {
	...automationFailedView,
	automation: { ...automation, target: { kind: "cloud", name: null } },
	run: {
		...automationFailedView.run,
		error: "The cloud workspace did not answer within 120 s",
		errorCode: "cloud_not_ready",
		session: laterCloudSession,
	},
};

/** A host with no name, an error with no code and a status the app does not know. */
export const automationUnknownView: AutomationFailedView = {
	...automationFailedView,
	automation: { ...automation, target: { kind: "host", name: null } },
	run: {
		...automationFailedView.run,
		status: "timed_out",
		error: "exit status 137",
		errorCode: null,
	},
	later: [
		{
			id: "f1e2d3c4-b5a6-4978-8a9b-00aa11bb2204",
			status: "timed_out",
			createdAt: ago(5 * HOUR),
			session: null,
		},
	],
};

export const automationLongView: AutomationFailedView = {
	...automationRecoveredView,
	automation: {
		...automation,
		name: LONG_NAME,
		target: {
			kind: "host",
			name: "Mira's MacBook Pro in the office on the third floor",
		},
	},
	run: {
		...automationFailedView.run,
		title: LONG_NAME,
		error: [
			"Error: spawn /Users/mira/.superset/worktrees/9c1d2e3f-aaaa-bbbb-cccc-0123456789ab/retry-writes-that-lose-the-lease/node_modules/.bin/a-very-long-binary-name-with-no-spaces-in-it ENOENT",
			"    at ChildProcess._handle.onexit (node:internal/child_process:286:19)",
			"    at onErrorNT (node:internal/child_process:484:16)",
			"    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)",
		].join("\n"),
		errorCode: "workspace_not_found",
	},
	later: [1, 2, 3, 4, 5].map((n) => ({
		id: `f1e2d3c4-b5a6-4978-8a9b-00aa11bb221${n}`,
		status: n % 2 ? "dispatched" : "dispatch_failed",
		createdAt: ago((6 - n) * HOUR),
		session: n % 2 ? laterCloudSession : null,
	})),
};

export const NOT_OWNER = "Only the automation's owner can run it";

export const automationActions: CardAction[] = [
	{ id: "retry", label: "Retry", style: "primary", role: "primary" },
];
export const automationNotOwnerActions = off(
	automationActions,
	"retry",
	NOT_OWNER,
);
