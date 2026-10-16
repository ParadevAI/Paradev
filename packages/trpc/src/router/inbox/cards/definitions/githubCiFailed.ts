import { z } from "zod";
import {
	type CardContext,
	type CardField,
	CardUnavailable,
	CHANGED_SINCE_CONFIRM,
	defineCard,
	type GithubCiFailedView,
	type GithubFailedJobView,
	withInput,
} from "../types";
import {
	agentPrompt,
	startedAgent,
	startedInput,
	startedNotice,
} from "./agentStarted";
import { type Github, githubFor, repoFacts } from "./githubClient";
import { logExcerpt } from "./githubLog";
import {
	type CheckRun,
	checkRuns,
	type LoadedPull,
	loadPull,
	type PullRefs,
	pullRefs,
	writable,
} from "./githubPull";

const RUNS_MAX = 4;
const JOBS_PER_RUN = 3;
const ANNOTATIONS_MAX = 5;
const PROMPT_MAX = 6000;
const FAILED = new Set([
	"failure",
	"timed_out",
	"cancelled",
	"startup_failure",
]);
const ACTIONS_JOB = /\/actions\/runs\/(\d+)\/job\/(\d+)/;

const statusSchema = z.object({
	statuses: z.array(
		z.object({
			context: z.string(),
			state: z.string(),
			target_url: z.string().nullable().optional(),
		}),
	),
});

const runSchema = z.object({
	id: z.number(),
	name: z.string().nullable().optional(),
	run_number: z.number().optional(),
	run_attempt: z.number().optional(),
	status: z.string().nullable(),
	html_url: z.string(),
});

const jobSchema = z.object({
	steps: z
		.array(
			z.object({
				number: z.number(),
				name: z.string(),
				conclusion: z.string().nullable(),
			}),
		)
		.optional(),
});

const annotationsSchema = z.array(
	z.object({
		path: z.string(),
		start_line: z.number().nullable().optional(),
		annotation_level: z.string().nullable(),
		message: z.string().nullable(),
	}),
);

type Run = GithubCiFailedView["runs"][number];

interface Data {
	name: string;
	sha: string;
	writable: true | string;
	failing: number;
	runs: Pick<Run, "id" | "name" | "url" | "running">[];
}

async function failedJob(
	github: Github,
	repo: string,
	check: CheckRun,
	jobId: number,
): Promise<GithubFailedJobView> {
	const [job, annotations, raw] = await Promise.all([
		github.find(`/repos/${repo}/actions/jobs/${jobId}`, jobSchema),
		github
			.find(
				`/repos/${repo}/check-runs/${check.id}/annotations?per_page=30`,
				annotationsSchema,
			)
			.catch(() => null),
		github.log(`/repos/${repo}/actions/jobs/${jobId}/logs`).catch(() => null),
	]);
	const step = job?.steps?.find((each) => FAILED.has(each.conclusion ?? ""));
	const excerpt = raw ? logExcerpt(raw) : { errors: [], log: "" };
	return {
		id: jobId,
		name: check.name,
		url: check.html_url ?? check.details_url ?? "",
		step: step ? { number: step.number, name: step.name } : null,
		errors: excerpt.errors,
		log: excerpt.log,
		annotations: (annotations ?? [])
			.filter(
				(each) =>
					each.annotation_level === "failure" &&
					each.message &&
					!each.path.startsWith(".github"),
			)
			.slice(0, ANNOTATIONS_MAX)
			.map((each) => ({
				path: each.path,
				line: each.start_line ?? null,
				message: (each.message ?? "").slice(0, 300),
			})),
	};
}

const named = (names: string[]) =>
	names.length > 1
		? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
		: (names[0] ?? "");

const fixPrompt = (pull: LoadedPull, runs: Run[]) =>
	agentPrompt(
		[
			`Fix the failing checks on ${pull.name} (${pull.view.url}).`,
			"Work on the pull request's branch and push the fix to that same branch.",
		],
		[
			`Title: ${pull.view.title}\nBranch: ${pull.view.head}`,
			...runs.flatMap((run) =>
				run.jobs.map((job) =>
					[
						`${run.name} / ${job.name}${job.step ? `, step "${job.step.name}"` : ""}`,
						...job.errors,
						job.log,
					]
						.filter(Boolean)
						.join("\n"),
				),
			),
		],
		PROMPT_MAX,
	);

const rerunInput = z.object({
	/** `pull.sha` from the view: the commit whose checks the reader saw. */
	sha: z.string().regex(/^[0-9a-f]{40}$/),
});

function rerun(path: "rerun-failed-jobs" | "rerun", what: string) {
	return {
		available: (data: Data) => {
			if (data.writable !== true) return data.writable;
			if (data.runs.length === 0) return "No failed Actions job to re-run";
			const busy = data.runs.find((run) => run.running);
			return busy ? `${busy.name} is still running` : (true as const);
		},
		confirm: (data: Data) =>
			`Re-run ${what} of ${named(data.runs.map((run) => run.name))} on ${data.name}?`,
		run: withInput(
			rerunInput,
			async ({
				refs,
				data,
				ctx,
				input,
			}: {
				refs: PullRefs;
				data: Data;
				ctx: CardContext;
				input: z.infer<typeof rerunInput>;
			}) => {
				if (input.sha !== data.sha)
					throw new CardUnavailable("error", CHANGED_SINCE_CONFIRM);
				const github = await githubFor(ctx);
				const done: Data["runs"] = [];
				for (const each of data.runs) {
					try {
						await github.write(
							"POST",
							`/repos/${refs.owner}/${refs.repo}/actions/runs/${each.id}/${path}`,
							{},
						);
						done.push(each);
					} catch (error) {
						if (done.length === 0 || !(error instanceof CardUnavailable))
							throw error;
						const left = data.runs.slice(done.length).map((run) => run.name);
						return {
							terminal: false,
							outcome: {},
							notice: {
								tone: "warn" as const,
								text: `Re-ran ${named(done.map((run) => run.name))}. Not re-run: ${named(left)} (${error.text})`,
							},
						};
					}
				}
				return {
					outcome: {
						rerun: path === "rerun" ? "all" : "failed",
						sha: data.sha,
						runs: done.map(({ id, name, url }) => ({ id, name, url })),
					},
					notice: {
						tone: "good" as const,
						text: `Re-ran ${named(done.map((run) => run.name))}`,
					},
				};
			},
		),
	};
}

export const githubCiFailed = defineCard<PullRefs, Data>({
	type: "github.ci_failed",
	tier: "update",
	label: "CI failed",
	ask: "Handle failing checks",
	brand: "github",
	refs: z.object(pullRefs),
	async resolve({ refs, ctx }) {
		const github = await githubFor(ctx);
		const repo = `${refs.owner}/${refs.repo}`;
		const [pull, facts] = await Promise.all([
			loadPull(github, refs),
			repoFacts(github, refs.owner, refs.repo),
		]);
		const [checks, statuses] = await Promise.all([
			checkRuns(github, repo, pull.view.sha),
			github
				.find(`/repos/${repo}/commits/${pull.view.sha}/status`, statusSchema)
				.then((found) => found?.statuses ?? []),
		]);
		const failedChecks = checks.filter((check) =>
			FAILED.has(check.conclusion ?? ""),
		);
		const failedStatuses = statuses.filter(
			(status) => status.state === "failure" || status.state === "error",
		);
		const byRun = new Map<number, { check: CheckRun; job: number }[]>();
		const others: GithubCiFailedView["others"] = failedStatuses.map(
			(status) => ({ name: status.context, url: status.target_url ?? null }),
		);
		for (const check of failedChecks) {
			const match =
				check.app?.slug === "github-actions"
					? ACTIONS_JOB.exec(check.details_url ?? check.html_url ?? "")
					: null;
			if (!match) {
				others.push({
					name: check.name,
					url: check.html_url ?? check.details_url ?? null,
				});
				continue;
			}
			const run = Number(match[1]);
			byRun.set(run, [
				...(byRun.get(run) ?? []),
				{ check, job: Number(match[2]) },
			]);
		}
		const shown = [...byRun].slice(0, RUNS_MAX);
		const runs: Run[] = await Promise.all(
			shown.map(async ([id, jobs]) => {
				const [run, detailed] = await Promise.all([
					github.get(`/repos/${repo}/actions/runs/${id}`, runSchema),
					Promise.all(
						jobs
							.slice(0, JOBS_PER_RUN)
							.map((each) => failedJob(github, repo, each.check, each.job)),
					),
				]);
				return {
					id,
					name: `${run.name ?? "Workflow"}${run.run_number ? ` #${run.run_number}` : ""}`,
					attempt: run.run_attempt ?? 1,
					url: run.html_url,
					running: run.status !== "completed",
					jobs: detailed,
				};
			}),
		);
		const total = checks.length + statuses.length;
		const failing = failedChecks.length + failedStatuses.length;
		const pending =
			checks.filter((check) => check.status !== "completed").length +
			statuses.filter((status) => status.state === "pending").length;
		const jobsShown = runs.reduce((sum, run) => sum + run.jobs.length, 0);
		const view: GithubCiFailedView = {
			kind: "github.ci_failed",
			pull: pull.view,
			runs,
			others,
			omitted: failing - others.length - jobsShown,
			total,
			failing,
			pending,
			fix: {
				slug: `${refs.repo}-${refs.number}-ci`,
				title: `Fix CI on ${pull.name}`,
				prompt: fixPrompt(pull, runs),
			},
		};
		const first = runs[0]?.jobs[0];
		const fields: CardField[] = [
			{ label: "Pull request", value: pull.name, href: pull.view.url },
			{
				label: "Branch",
				value: `${pull.view.head} → ${pull.view.base}`,
				mono: true,
			},
			{ label: "Checks", value: `${failing} of ${total} failing` },
			...(first
				? [
						{
							label: "Failed",
							value: `${first.name}${first.step ? `: ${first.step.name}` : ""}`,
							href: first.url,
						},
					]
				: []),
		];
		return {
			title: pull.view.title,
			subtitle: pull.name,
			status:
				failing > 0
					? { tone: "bad", text: "Checks failing" }
					: pending > 0
						? { tone: "warn", text: "Checks running" }
						: total === 0
							? { tone: "neutral", text: "No checks" }
							: { tone: "good", text: "No failing checks" },
			fields,
			body: first?.errors.join("\n") || undefined,
			view,
			data: {
				name: pull.name,
				sha: pull.view.sha,
				writable: writable(pull, facts.canPush),
				failing,
				runs: runs.map(({ id, name, url, running }) => ({
					id,
					name,
					url,
					running,
				})),
			},
		};
	},
	actions: {
		rerun_failed: {
			label: () => "Re-run failed jobs",
			style: "primary",
			role: "primary",
			...rerun("rerun-failed-jobs", "the failed jobs"),
		},
		rerun_all: {
			label: () => "Re-run all jobs",
			style: "secondary",
			role: "other",
			...rerun("rerun", "all jobs"),
		},
		started: {
			label: () => "Start an agent to fix it",
			style: "secondary",
			role: "other",
			applies: (data) => data.failing > 0 && data.writable === true,
			run: withInput(startedInput, async ({ data, ctx, input }) => {
				const started = await startedAgent(ctx, input.workspace);
				return {
					outcome: { started },
					notice: { tone: "good", text: startedNotice(started, data.name) },
				};
			}),
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { rerun: null } };
			},
		},
	},
});
