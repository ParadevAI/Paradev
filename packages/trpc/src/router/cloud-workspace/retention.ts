import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import {
	cloudWorkspaces,
	environments,
	sandboxBundles,
} from "@superset/db/schema";
import { SANDBOX_AGENT_TOOLS_DRIVE_PATTERN } from "@superset/shared/sandbox/contract";
import { and, desc, eq, gt } from "drizzle-orm";
import {
	deleteDrive,
	type ListedDrive,
	type ListedSandbox,
	listProjectDrives,
	listProjectSandboxes,
} from "../../lib/sandbox";
import { goldensToDelete } from "./golden-rotation";
import { deleteSandboxAndDriveLater } from "./teardown";
import { namedSandboxes } from "./teardown-guard";
import {
	DAY_MS,
	findPastWait,
	RETIRE_BATCH,
	retireWorkspace,
	WAIT,
} from "./wait";

export const RETENTION_JOB_PATH = "/api/cloud-workspaces/jobs/reap-retention";

/** Rule 3: what nothing in production names goes this long after it was made. */
export const LEFTOVER_AGE_MS = 7 * DAY_MS;
/** A release publishes its agents drives before it records its bundle as current. */
export const NEW_AGENTS_DRIVE_MS = DAY_MS;
/** Stops starting new work here, well inside the route's 300 s. */
export const RUN_BUDGET_MS = 200_000;
/** At most 4 teardowns queued a second: far under Vercel's 20 deletions a second. */
export const TEARDOWN_SPACING_MS = 250;
const RUNNING = new Set(["pending", "running"]);

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

export interface EnvironmentGoldens {
	id: string;
	archived: boolean;
	activeRef: string | null;
	/** Undeleted goldens, newest first. On main only the active one is recorded. */
	goldens: string[];
}

async function listEnvironmentGoldens(): Promise<EnvironmentGoldens[]> {
	const rows = await db
		.select({
			id: environments.id,
			archivedAt: environments.archivedAt,
			sourceKind: environments.sourceKind,
			sourceRef: environments.sourceRef,
		})
		.from(environments)
		.where(eq(environments.provider, "vercel"));
	return rows.map((row) => {
		const golden = row.sourceKind === "fork" ? row.sourceRef : null;
		return {
			id: row.id,
			archived: row.archivedAt !== null,
			activeRef: golden,
			goldens: golden ? [golden] : [],
		};
	});
}

async function currentBundleSha(): Promise<string | null> {
	const [row] = await db
		.select({ sha: sandboxBundles.sha })
		.from(sandboxBundles)
		.orderBy(desc(sandboxBundles.releasedAt))
		.limit(1);
	return row?.sha ?? null;
}

export const defaultRetentionDeps = {
	boxesRunningNow,
	listSandboxes: listProjectSandboxes,
	listDrives: listProjectDrives,
	findPastWait,
	retireWorkspace,
	listEnvironmentGoldens,
	/** Named by a live workspace or an unarchived environment, or with `archived`, by any row. */
	namedSandboxes,
	/** Workspace drives rows name: none on main; #9847's `drive_name` and `golden_drive_name`. */
	namedDrives: async (_names: readonly string[]) => new Set<string>(),
	currentBundleSha,
	tearDownBox: (providerSandboxId: string) =>
		deleteSandboxAndDriveLater({ providerSandboxId, driveName: null }),
	deleteDrive,
	pause: (ms: number) =>
		new Promise<void>((resolve) => setTimeout(resolve, ms)),
	log: (line: string) => console.log(line),
};
export type RetentionDeps = typeof defaultRetentionDeps;

/** Every dependency that writes a row or deletes in Vercel; a dry run replaces each one. */
export const MUTATING_DEPS = [
	"retireWorkspace",
	"tearDownBox",
	"deleteDrive",
	"pause",
] as const satisfies readonly (keyof RetentionDeps)[];

const dryRunDeps = (deps: RetentionDeps): RetentionDeps => ({
	...deps,
	retireWorkspace: async () => true,
	tearDownBox: async () => {},
	deleteDrive: async () => {},
	pause: async () => {},
});

type Ctx = {
	now: number;
	deps: RetentionDeps;
	boxes: ListedSandbox[];
	drives: ListedDrive[];
	retired: Set<string>;
};

/** One item a rule looked at: kept with a reason, or acted on. */
type Verdict = {
	group: string;
	name: string;
	/** The box an act retires, which rule 3 then leaves alone. */
	box?: string;
	keep?: string;
	reason?: string;
	/** False when the row changed since it was read. */
	act?: () => Promise<boolean>;
};

type Rule = {
	rule: 1 | 2 | 3;
	batch: number;
	paced: boolean;
	select: (ctx: Ctx) => Promise<Verdict[]>;
};

const tearDown = (ctx: Ctx, name: string) => async () => {
	await ctx.deps.tearDownBox(name);
	return true;
};

const RULES: Rule[] = [
	{
		rule: 1,
		batch: RETIRE_BATCH,
		paced: true,
		select: async (ctx) => {
			const status = new Map(ctx.boxes.map((box) => [box.name, box.status]));
			const rows = await ctx.deps.findPastWait(
				ctx.now,
				ctx.boxes.map((box) => box.name),
			);
			return rows.map((row) => ({
				group: `workspace ${row.status}`,
				name: `${row.id} (${row.providerSandboxId})`,
				box: row.providerSandboxId,
				// With billing off no boot row guards a wake in flight; the listing does.
				keep:
					row.status === "asleep" &&
					RUNNING.has(status.get(row.providerSandboxId) ?? "")
						? "asleep past its wait, but its box runs a session now"
						: undefined,
				reason: `${row.status} for more than ${WAIT[row.status].ms / DAY_MS} days`,
				act: () => ctx.deps.retireWorkspace(row, ctx.now),
			}));
		},
	},
	{
		rule: 2,
		batch: 20,
		paced: true,
		select: async (ctx) => {
			const listed = new Set(ctx.boxes.map((box) => box.name));
			const verdicts: Verdict[] = [];
			const due: string[] = [];
			for (const env of await ctx.deps.listEnvironmentGoldens()) {
				const drop = new Set(
					env.archived
						? env.goldens
						: goldensToDelete(
								env.goldens.map((goldenRef) => ({ goldenRef })),
								env.activeRef ?? "",
							).map((golden) => golden.goldenRef),
				);
				for (const golden of env.goldens) {
					if (!drop.has(golden)) {
						verdicts.push({
							group: "golden",
							name: golden,
							keep: `${golden === env.activeRef ? "active golden" : "among the newest goldens"} of environment ${env.id}`,
						});
					} else if (listed.has(golden) && !ctx.retired.has(golden)) {
						due.push(golden);
					}
				}
			}
			const named = await ctx.deps.namedSandboxes(due);
			return [
				...verdicts,
				...due.map((name) => ({
					group: "golden",
					name,
					box: name,
					keep: named.has(name)
						? "a live workspace or environment still names it"
						: undefined,
					reason: "its environment is archived or keeps newer goldens",
					act: tearDown(ctx, name),
				})),
			];
		},
	},
	{
		rule: 3,
		batch: 200,
		paced: true,
		select: async (ctx) => {
			const fresh = ctx.boxes.filter((box) => !ctx.retired.has(box.name));
			const named = await ctx.deps.namedSandboxes(
				fresh.map((box) => box.name),
				{ archived: true },
			);
			return fresh.map((box) => ({
				group: "box",
				name: box.name,
				keep: named.has(box.name)
					? "a production row names it"
					: ctx.now - box.createdAt < LEFTOVER_AGE_MS
						? "made less than 7 days ago"
						: undefined,
				reason: "no production row names it, made more than 7 days ago",
				act: tearDown(ctx, box.name),
			}));
		},
	},
	{
		rule: 3,
		batch: 50,
		paced: false,
		select: async (ctx) => {
			const mountedBy = new Map<string, string>();
			for (const box of ctx.boxes) {
				for (const drive of box.mounts) mountedBy.set(drive, box.name);
			}
			const isAgents = (name: string) =>
				SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(name);
			const current = await ctx.deps.currentBundleSha();
			const named = await ctx.deps.namedDrives(
				ctx.drives.map((d) => d.name).filter((name) => !isAgents(name)),
			);
			const keepReason = (drive: ListedDrive): string | undefined => {
				const mounter = mountedBy.get(drive.name);
				if (mounter) return `mounted by box ${mounter}`;
				if (drive.attachedTo) return `attached to ${drive.attachedTo}`;
				const age = ctx.now - drive.createdAt;
				if (isAgents(drive.name)) {
					if (!current) return "no current release recorded";
					if (drive.name.endsWith(`-${current.slice(0, 12)}`)) {
						return "the current release's";
					}
					if (age < NEW_AGENTS_DRIVE_MS) {
						return "published less than a day ago: its release may not be recorded yet";
					}
					return undefined;
				}
				if (named.has(drive.name)) return "a production row names it";
				if (age < LEFTOVER_AGE_MS) return "made less than 7 days ago";
				return undefined;
			};
			return ctx.drives.map((drive) => ({
				group: isAgents(drive.name) ? "agents drive" : "drive",
				name: drive.name,
				keep: keepReason(drive),
				reason: isAgents(drive.name)
					? "not the current release's, and no box mounts it"
					: "no production row names it and no box mounts it, made more than 7 days ago",
				act: async () => {
					await ctx.deps.deleteDrive(drive.name);
					return true;
				},
			}));
		},
	},
];

type Counts = Record<"kept" | "deleted" | "deferred" | "failed", number>;
export type RetentionRun =
	| { skipped: "not production" }
	| { skipped: "listing incomplete"; reason: string }
	| { counts: Record<string, Counts> };

/**
 * The cleanup job, every 6 hours, production only: the one place that
 * deletes for age or for being unused. Each rule selects what it looks at
 * and keeps or acts on each item. It reads the whole Vercel listing first
 * and deletes nothing if it cannot.
 */
export async function reapCloudWorkspaceRetention({
	now = Date.now(),
	production,
	deps: given = defaultRetentionDeps,
	clock = Date.now,
	dryRun = false,
}: {
	now?: number;
	production: boolean;
	deps?: RetentionDeps;
	clock?: () => number;
	/** Reads everything, writes and deletes nothing, and logs "would delete". */
	dryRun?: boolean;
}): Promise<RetentionRun> {
	const deps = dryRun ? dryRunDeps(given) : given;
	if (!production) {
		deps.log("[cleanup] skipped: only production runs the cleanup job");
		return { skipped: "not production" };
	}
	const startedAt = clock();
	let ctx: Ctx;
	try {
		const boxes = await deps.listSandboxes(await deps.boxesRunningNow(now));
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
	const counts: Record<string, Counts> = {};
	let failed = false;
	for (const rule of RULES) {
		let started = 0;
		for (const v of await rule.select(ctx)) {
			const key = `rule${rule.rule} ${v.group}`;
			counts[key] ??= { kept: 0, deleted: 0, deferred: 0, failed: 0 };
			const c = counts[key];
			const log = (action: string, reason: string | undefined) =>
				deps.log(
					`[cleanup] ${JSON.stringify({ rule: rule.rule, kind: v.group, name: v.name, action, reason })}`,
				);
			if (v.keep || !v.act) {
				c.kept++;
				log("keep", v.keep);
				continue;
			}
			if (started >= rule.batch || clock() - startedAt > RUN_BUDGET_MS) {
				c.deferred++;
				continue;
			}
			started++;
			try {
				if (!(await v.act())) {
					c.kept++;
					log("keep", "changed since it was read");
					continue;
				}
				c.deleted++;
				if (v.box) ctx.retired.add(v.box);
				log(dryRun ? "would delete" : "delete", v.reason);
				if (rule.paced) await deps.pause(TEARDOWN_SPACING_MS);
			} catch (error) {
				c.failed++;
				failed = true;
				log("keep", `failed: ${String(error).slice(0, 200)}`);
				Sentry.captureException(error, {
					extra: { rule: rule.rule, name: v.name },
				});
			}
		}
	}
	deps.log(`[cleanup] run ${JSON.stringify(counts)}`);
	Sentry.logger.info("retention.run", { counts: JSON.stringify(counts) });
	if (failed) {
		Sentry.captureMessage("cleanup job run had failures", {
			level: "warning",
			extra: { counts },
		});
	}
	return { counts };
}
