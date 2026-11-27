import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces, sandboxBundles } from "@superset/db/schema";
import { SANDBOX_AGENT_TOOLS_DRIVE_PATTERN } from "@superset/shared/sandbox/contract";
import { and, desc, eq, gt } from "drizzle-orm";
import {
	deleteDrive,
	type ListedSandbox,
	listProjectDrives,
	listProjectSandboxes,
	sandboxDeletesAllowed,
} from "../../lib/sandbox";
import { namedSandboxes, teardownBox } from "./teardown";
import { BATCH, DAY_MS, findPastWait, retireWorkspace, WAIT } from "./wait";

export const RETENTION_JOB_PATH = "/api/cloud-workspaces/jobs/reap-retention";

/** Rule 3: what nothing in production names goes this long after it was made. */
export const LEFTOVER_AGE_MS = 7 * DAY_MS;
/**
 * An agents drive younger than this is kept (a release publishes before it
 * records), and so is the previous release's until the current one is this old.
 */
export const AGENTS_DRIVE_KEEP_MS = 2 * DAY_MS;
/** Stops starting new work here, well inside the route's 300 s. */
export const RUN_BUDGET_MS = 200_000;
/** Deletes at once: far under Vercel's 20 deletions a second. */
const CONCURRENCY = 4;

/** A few boxes running now: a listing without them is not the whole project. */
async function boxesRunningNow(now: number): Promise<string[]> {
	const rows = await db
		.select({ name: cloudWorkspaces.providerSandboxId })
		.from(cloudWorkspaces)
		.where(
			and(
				eq(cloudWorkspaces.provider, "vercel"),
				eq(cloudWorkspaces.status, "awake"),
				gt(cloudWorkspaces.sandboxExpiresAt, new Date(now + 60_000)),
			),
		)
		.limit(3);
	return rows.map((row) => row.name);
}

/** The current release and the one before it, newest first. */
async function recentReleases(): Promise<
	Array<{ sha: string; releasedAt: Date }>
> {
	return db
		.select({ sha: sandboxBundles.sha, releasedAt: sandboxBundles.releasedAt })
		.from(sandboxBundles)
		.orderBy(desc(sandboxBundles.releasedAt))
		.limit(2);
}

export const defaultRetentionDeps = {
	boxesRunningNow,
	listSandboxes: listProjectSandboxes,
	listDrives: listProjectDrives,
	findPastWait,
	retireWorkspace,
	namedSandboxes,
	recentReleases,
	teardownBox,
	deleteDrive,
	log: (line: string) => console.log(line),
};
export type RetentionDeps = typeof defaultRetentionDeps;

type Ctx = {
	now: number;
	deps: RetentionDeps;
	boxes: ListedSandbox[];
	drives: Awaited<ReturnType<RetentionDeps["listDrives"]>>;
	retired: Set<string>;
};

/** One item a rule looked at: kept with a reason, or acted on. */
type Verdict = {
	name: string;
	keep?: string;
	reason?: string;
	/** False when the row changed since it was read, or a row names the box now. */
	act?: () => Promise<boolean>;
};

const RULES: Array<{ name: string; select: (ctx: Ctx) => Promise<Verdict[]> }> =
	[
		{
			// Rule 1: a workspace past its wait in `WAIT` is retired, then its box deleted.
			name: "rule1 workspaces",
			select: async (ctx) => {
				const rows = await ctx.deps.findPastWait(
					ctx.now,
					ctx.boxes.map((box) => box.name),
				);
				return rows.map((row) => ({
					name: `${row.id} (${row.providerSandboxId})`,
					reason: `${row.status} for more than ${WAIT[row.status].ms / DAY_MS} days`,
					act: async () => {
						ctx.retired.add(row.providerSandboxId);
						return ctx.deps.retireWorkspace(row, ctx.now);
					},
				}));
			},
		},
		{
			// Rule 3, which also covers an archived environment's goldens: no live row names them.
			name: "rule3 boxes",
			select: async (ctx) => {
				const fresh = ctx.boxes.filter((box) => !ctx.retired.has(box.name));
				const named = await ctx.deps.namedSandboxes(
					fresh.map((box) => box.name),
				);
				return fresh.map((box) => ({
					name: box.name,
					keep: named.has(box.name)
						? "a production row names it"
						: ctx.now - box.createdAt < LEFTOVER_AGE_MS
							? "made less than 7 days ago"
							: undefined,
					reason: "no production row names it, made more than 7 days ago",
					act: () => ctx.deps.teardownBox(box.name),
				}));
			},
		},
		{
			name: "rule3 drives",
			select: async (ctx) => {
				const [current, previous] = await ctx.deps.recentReleases();
				const of = (release: { sha: string }, name: string) =>
					name.endsWith(`-${release.sha.slice(0, 12)}`);
				const previousKept =
					current &&
					ctx.now - current.releasedAt.getTime() < AGENTS_DRIVE_KEEP_MS;
				return ctx.drives.map((drive) => {
					const agents = SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(drive.name);
					const age = ctx.now - drive.createdAt;
					const keep = !agents
						? age < LEFTOVER_AGE_MS
							? "made less than 7 days ago"
							: undefined
						: !current
							? "no current release recorded"
							: of(current, drive.name)
								? "the current release's"
								: previousKept && previous && of(previous, drive.name)
									? "the previous release's, kept 48 h after the current one"
									: age < AGENTS_DRIVE_KEEP_MS
										? "made less than 48 h ago"
										: undefined;
					return {
						name: drive.name,
						keep,
						reason: agents
							? "not the current release's, nor the previous one's within 48 h"
							: "made more than 7 days ago",
						act: async () => {
							await ctx.deps.deleteDrive(drive.name);
							return true;
						},
					};
				});
			},
		},
	];

export type RetentionRun =
	| { skipped: "not production" }
	| { skipped: "listing incomplete"; reason: string }
	| { counts: Record<string, { kept: number; deleted: number }> };

/**
 * The cleanup job, every 6 hours, production only: the one place that
 * deletes for age or for being unused. It reads the whole Vercel listing
 * first and deletes nothing if it cannot; each rule then keeps or acts on
 * what it selects. A delete that fails is tried again on the next run.
 */
export async function reapCloudWorkspaceRetention({
	now = Date.now(),
	deps = defaultRetentionDeps,
	clock = Date.now,
}: {
	now?: number;
	deps?: RetentionDeps;
	clock?: () => number;
} = {}): Promise<RetentionRun> {
	if (!sandboxDeletesAllowed("anything: the cleanup job")) {
		return { skipped: "not production" };
	}
	const startedAt = clock();
	let ctx: Ctx;
	try {
		const expected = await deps.boxesRunningNow(now);
		const boxes = await deps.listSandboxes();
		const names = new Set(boxes.map((box) => box.name));
		const missing = expected.filter((name) => !names.has(name));
		if (!boxes.length || missing.length) {
			throw new Error(`listing is empty or lacks ${missing.join(", ")}`);
		}
		ctx = {
			now,
			deps,
			boxes,
			drives: await deps.listDrives(),
			retired: new Set(),
		};
	} catch (error) {
		const reason = String(error).slice(0, 300);
		deps.log(`[cleanup] listing incomplete, deleted nothing: ${reason}`);
		Sentry.captureMessage("cleanup job: listing incomplete, deleted nothing", {
			level: "warning",
			extra: { reason },
		});
		return { skipped: "listing incomplete", reason };
	}
	const counts: Record<string, { kept: number; deleted: number }> = {};
	for (const rule of RULES) {
		const count = { kept: 0, deleted: 0 };
		counts[rule.name] = count;
		const log = (v: Verdict, action: string, reason?: string) =>
			deps.log(
				`[cleanup] ${JSON.stringify({ rule: rule.name, name: v.name, action, reason })}`,
			);
		const due: Verdict[] = [];
		for (const v of await rule.select(ctx)) {
			if (v.act && !v.keep) {
				due.push(v);
			} else {
				count.kept++;
				log(v, "keep", v.keep);
			}
		}
		const work = due.slice(0, BATCH);
		for (let i = 0; i < work.length; i += CONCURRENCY) {
			if (clock() - startedAt > RUN_BUDGET_MS) break;
			await Promise.all(
				work.slice(i, i + CONCURRENCY).map(async (v) => {
					try {
						if (await v.act?.()) {
							count.deleted++;
							log(v, "delete", v.reason);
						} else {
							count.kept++;
							log(v, "keep", "changed since it was read");
						}
					} catch (error) {
						log(v, "failed", String(error).slice(0, 200));
						Sentry.captureException(error, {
							extra: { rule: rule.name, name: v.name },
						});
					}
				}),
			);
		}
	}
	deps.log(`[cleanup] run ${JSON.stringify(counts)}`);
	return { counts };
}
