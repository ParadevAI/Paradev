import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import type { CloudWorkspaceFailureReason } from "@superset/db/enums";
import {
	cloudWorkspaceBoots,
	cloudWorkspaces,
	environments,
	sandboxBundles,
} from "@superset/db/schema";
import { SANDBOX_AGENT_TOOLS_DRIVE_PATTERN } from "@superset/shared/sandbox/contract";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	isNull,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { logControl } from "../../lib/control-log";
import { nudge } from "../../lib/realtime";
import {
	deleteDrive,
	type ListedDrive,
	type ListedSandbox,
	listProjectDrives,
	listProjectSandboxes,
} from "../../lib/sandbox";
import { goldensToDelete } from "./golden-rotation";
import { settleWorkspaceNow } from "./meter";
import { ARCHIVE_GRACE_SECONDS, reapWorkspaceFiles } from "./reap";
import { recordBootEnd } from "./sandbox-sleep";
import { deleteSandboxAndDriveLater, retireAndTearDown } from "./teardown";
import { namedByAnyRow, namedSandboxes } from "./teardown-guard";

export const RETENTION_JOB_PATH = "/api/cloud-workspaces/jobs/reap-retention";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rule 1: how long a workspace not in use keeps its box, snapshot and drive. */
export const WAIT_MS = {
	/** Since last use: what Vercel's snapshot expiry gave before we owned it. */
	asleep: 30 * DAY_MS,
	/** Since the archive; an unarchive inside it keeps everything, after it is refused. */
	archived: ARCHIVE_GRACE_SECONDS * 1000,
	/** Since it failed: long enough to look at what went wrong. */
	failed: 30 * DAY_MS,
	/** Stuck creating with no boot since: every delivery of its job died. */
	provisioning: DAY_MS,
} as const;

export type WaitStatus = keyof typeof WAIT_MS;
const WAIT_STATUSES = Object.keys(WAIT_MS) as WaitStatus[];

/** Rule 3: a box, drive or golden nothing in production names goes this long after it was made. */
export const LEFTOVER_AGE_MS = 7 * DAY_MS;
/** A release publishes its agents drives before it records its bundle as current. */
export const NEW_AGENTS_DRIVE_MS = DAY_MS;

/**
 * Every 6 hours, so 800 a day: production made a median 156 workspaces a day
 * and at most 725 in the 30 days to 2026-11-18. A backlog takes more runs.
 */
export const RETIRE_BATCH = 200;
export const GOLDEN_BATCH = 20;
export const LEFTOVER_BOX_BATCH = 200;
export const DRIVE_BATCH = 50;
/** Stops starting new work here, well inside the route's 300 s; the rest waits for the next run. */
export const RUN_BUDGET_MS = 200_000;
/** At most 4 teardowns queued a second: far under Vercel's 20 deletions a second per team. */
export const TEARDOWN_SPACING_MS = 250;
const NAME_LOOKUP_CHUNK = 500;
/** Boxes running now, which the box listing must contain to count as whole. */
const EXPECTED_IN_LISTING = 3;
const RUNNING_STATUSES = new Set(["pending", "running"]);

const at = (cutoff: Date) => sql`${cutoff.toISOString()}::timestamptz`;

/**
 * Nothing used the workspace since `cutoff`. Boots count because a wake
 * writes its boot before Vercel resumes the box, so one in flight keeps the
 * row. `sandbox_expires_at` and `created_at` count too: when they disagree
 * with the boots, the later one wins and the box is kept longer.
 */
export function idleSince(cutoff: Date): SQL {
	return and(
		lt(cloudWorkspaces.createdAt, cutoff),
		or(
			isNull(cloudWorkspaces.sandboxExpiresAt),
			lt(cloudWorkspaces.sandboxExpiresAt, cutoff),
		),
		sql`not exists (select 1 from ${cloudWorkspaceBoots} where ${cloudWorkspaceBoots.cloudWorkspaceId} = ${cloudWorkspaces.id} and (${cloudWorkspaceBoots.stoppedAt} is null or ${cloudWorkspaceBoots.stoppedAt} >= ${at(cutoff)} or ${cloudWorkspaceBoots.startedAt} >= ${at(cutoff)}))`,
	) as SQL;
}

/** Rows archived before `deleted_at` existed count from their last write. */
function archivedBefore(cutoff: Date): SQL {
	return sql`coalesce(${cloudWorkspaces.deletedAt}, ${cloudWorkspaces.updatedAt}) < ${at(cutoff)}`;
}

/** Rows failed before `failed_at` existed count from their last write. */
function failedBefore(cutoff: Date): SQL {
	return and(
		isNull(cloudWorkspaces.deletedAt),
		sql`coalesce(${cloudWorkspaces.failedAt}, ${cloudWorkspaces.updatedAt}) < ${at(cutoff)}`,
	) as SQL;
}

/** An unarchive moves an old row to provisioning, so `updated_at` counts, not only `created_at`. */
function noBootSince(cutoff: Date): SQL {
	return and(
		isNull(cloudWorkspaces.deletedAt),
		lt(cloudWorkspaces.createdAt, cutoff),
		lt(cloudWorkspaces.updatedAt, cutoff),
		sql`not exists (select 1 from ${cloudWorkspaceBoots} where ${cloudWorkspaceBoots.cloudWorkspaceId} = ${cloudWorkspaces.id} and ${cloudWorkspaceBoots.startedAt} >= ${at(cutoff)})`,
	) as SQL;
}

interface WaitRule {
	since: (cutoff: Date) => SQL;
	/** The status the retire write gives the row; null keeps its status. */
	failAs: CloudWorkspaceFailureReason | null;
}

/**
 * Rule 1's wait table. A retired row leaves the selection: an asleep or
 * stuck row fails, and a row that keeps its status (archived, failed) is
 * selected only while its box is listed, which a retired name never is.
 */
export const WAIT_RULES: Record<WaitStatus, WaitRule> = {
	asleep: {
		since: (cutoff) =>
			and(isNull(cloudWorkspaces.deletedAt), idleSince(cutoff)) as SQL,
		failAs: "snapshot_expired",
	},
	archived: { since: archivedBefore, failAs: null },
	failed: { since: failedBefore, failAs: null },
	provisioning: { since: noBootSince, failAs: "create_failed" },
};

export function waitCutoff(status: WaitStatus, now: number): Date {
	return new Date(now - WAIT_MS[status]);
}

/** Still in `status` and still past its wait: the condition of the one retire write. */
export function pastWait(status: WaitStatus, now: number): SQL {
	return and(
		eq(cloudWorkspaces.provider, "vercel"),
		eq(cloudWorkspaces.status, status),
		WAIT_RULES[status].since(waitCutoff(status, now)),
	) as SQL;
}

function amongNames(names: readonly string[]): SQL {
	const usable = names.filter((name) => !name.includes(","));
	if (usable.length === 0) return sql`false`;
	return sql`${cloudWorkspaces.providerSandboxId} = any(string_to_array(${usable.join(",")}, ','))`;
}

/** Rule 1 as one select. */
export function waitOverWhere({
	now,
	listedNames,
}: {
	now: number;
	listedNames: readonly string[];
}): SQL {
	return or(
		...WAIT_STATUSES.map((status) =>
			WAIT_RULES[status].failAs
				? pastWait(status, now)
				: and(pastWait(status, now), amongNames(listedNames)),
		),
	) as SQL;
}

export interface WaitingWorkspace {
	id: string;
	organizationId: string;
	providerSandboxId: string;
	status: WaitStatus;
}

async function findPastWait(args: {
	now: number;
	listedNames: readonly string[];
	limit: number;
}): Promise<WaitingWorkspace[]> {
	const rows = await db
		.select({
			id: cloudWorkspaces.id,
			organizationId: cloudWorkspaces.organizationId,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
			status: cloudWorkspaces.status,
		})
		.from(cloudWorkspaces)
		.where(waitOverWhere(args))
		.orderBy(asc(cloudWorkspaces.createdAt))
		.limit(args.limit);
	return rows.filter((row): row is WaitingWorkspace =>
		(WAIT_STATUSES as string[]).includes(row.status),
	);
}

/**
 * teardown(row): one conditional write takes the box name off the row, and
 * the status with it, while the row is still in its status and still past its
 * wait; then the box is deleted through the retried teardown job. A wake that
 * lands first wins, and this returns false. An archived row ends its boots
 * and settles its usage first, and its files go with the box.
 */
export async function retireWorkspace(
	row: WaitingWorkspace,
	now: number,
): Promise<boolean> {
	const scope = {
		cloudWorkspaceId: row.id,
		organizationId: row.organizationId,
	};
	if (row.status === "archived") {
		await recordBootEnd(scope, { sessionId: null, reason: "archived" });
		await settleWorkspaceNow(row.id).catch((error) =>
			console.error(`[cloud-workspace] ${row.id} final settle failed`, error),
		);
	}
	const failAs = WAIT_RULES[row.status].failAs;
	const retired = await retireAndTearDown(
		{ id: row.id, providerSandboxId: row.providerSandboxId, driveName: null },
		pastWait(row.status, now),
		failAs
			? {
					status: "failed",
					failureReason: failAs,
					failedAt: new Date(now),
					sandboxUrl: null,
				}
			: {},
	);
	if (!retired) return false;
	if (row.status === "archived") await reapWorkspaceFiles(row.id);
	if (failAs) {
		logControl("workspace.failed", scope, { "failure.reason": failAs }, "warn");
		nudge(row.organizationId, "cloud_workspaces");
	}
	return true;
}

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
		.limit(EXPECTED_IN_LISTING);
	return rows.map((row) => row.name);
}

export interface EnvironmentGoldens {
	id: string;
	archived: boolean;
	activeRef: string | null;
	/** Undeleted goldens, newest first. */
	goldens: string[];
}

/** On main an environment records only its active golden; a fork's golden is a box. */
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
	return rows.map((row) => ({
		id: row.id,
		archived: row.archivedAt !== null,
		activeRef: row.sourceKind === "fork" ? row.sourceRef : null,
		goldens: row.sourceKind === "fork" ? [row.sourceRef] : [],
	}));
}

async function currentBundleSha(): Promise<string | null> {
	const [row] = await db
		.select({ sha: sandboxBundles.sha })
		.from(sandboxBundles)
		.orderBy(desc(sandboxBundles.releasedAt))
		.limit(1);
	return row?.sha ?? null;
}

async function inChunks(
	names: readonly string[],
	lookup: (chunk: string[]) => Promise<Set<string>>,
): Promise<Set<string>> {
	const found = new Set<string>();
	for (let i = 0; i < names.length; i += NAME_LOOKUP_CHUNK) {
		for (const name of await lookup(names.slice(i, i + NAME_LOOKUP_CHUNK))) {
			found.add(name);
		}
	}
	return found;
}

export interface RetentionDeps {
	boxesRunningNow: typeof boxesRunningNow;
	listSandboxes: typeof listProjectSandboxes;
	listDrives: typeof listProjectDrives;
	findPastWait: typeof findPastWait;
	retireWorkspace: typeof retireWorkspace;
	listEnvironmentGoldens: typeof listEnvironmentGoldens;
	/** Named by a live workspace or an unarchived environment: what a golden delete must not take. */
	namedByLiveRow: (names: readonly string[]) => Promise<Set<string>>;
	/** Named by any production row, archived ones included. */
	namedByAnyRow: (names: readonly string[]) => Promise<Set<string>>;
	/** Workspace drives rows name: none on main; #9847's `drive_name` and `golden_drive_name`. */
	namedDrives: (names: readonly string[]) => Promise<Set<string>>;
	currentBundleSha: typeof currentBundleSha;
	tearDownBox: (providerSandboxId: string) => Promise<void>;
	deleteDrive: typeof deleteDrive;
	pause: (ms: number) => Promise<void>;
	log: (line: string) => void;
}

const defaultDeps: RetentionDeps = {
	boxesRunningNow,
	listSandboxes: listProjectSandboxes,
	listDrives: listProjectDrives,
	findPastWait,
	retireWorkspace,
	listEnvironmentGoldens,
	namedByLiveRow: (names) => inChunks(names, namedSandboxes),
	namedByAnyRow: (names) => inChunks(names, namedByAnyRow),
	namedDrives: async () => new Set(),
	currentBundleSha,
	tearDownBox: (providerSandboxId) =>
		deleteSandboxAndDriveLater({ providerSandboxId, driveName: null }),
	deleteDrive,
	pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	log: (line) => console.log(line),
};

type Counts = {
	kept: number;
	deleted: number;
	deferred: number;
	failed: number;
};

const perStatus = (): Record<WaitStatus, number> => ({
	asleep: 0,
	archived: 0,
	failed: 0,
	provisioning: 0,
});

export type RetentionRun =
	| { skipped: "not production" }
	| { skipped: "listing incomplete"; reason: string }
	| {
			rule1: {
				found: Record<WaitStatus, number>;
				retired: Record<WaitStatus, number>;
				skippedRunning: number;
				skippedChanged: number;
				deferred: number;
				failed: number;
			};
			rule2: Counts & { environments: number };
			rule3: { boxes: Counts; drives: Counts; agentsDrives: Counts };
	  };

type Decision = {
	rule: 1 | 2 | 3;
	kind: "workspace" | "box" | "golden" | "drive" | "agents drive";
	name: string;
	action: "keep" | "delete";
	reason: string;
};

/**
 * The cleanup job, every 6 hours, production only: the one place that
 * deletes for age or for being unused. Rule 1 retires workspaces past their
 * wait, rule 2 deletes goldens an environment no longer keeps, rule 3
 * deletes what nothing in production names. It reads the whole Vercel
 * listing first and deletes nothing if it cannot.
 */
export async function reapCloudWorkspaceRetention({
	now = Date.now(),
	production,
	deps = defaultDeps,
	clock = Date.now,
}: {
	now?: number;
	production: boolean;
	deps?: RetentionDeps;
	clock?: () => number;
}): Promise<RetentionRun> {
	if (!production) {
		deps.log("[cleanup] skipped: only production runs the cleanup job");
		return { skipped: "not production" };
	}
	const startedAt = clock();
	const outOfTime = () => clock() - startedAt > RUN_BUDGET_MS;
	const decide = (decision: Decision) =>
		deps.log(`[cleanup] ${JSON.stringify(decision)}`);
	let boxes: ListedSandbox[];
	let drives: ListedDrive[];
	try {
		boxes = await deps.listSandboxes(await deps.boxesRunningNow(now));
		drives = await deps.listDrives();
	} catch (error) {
		const reason = String(error).slice(0, 300);
		deps.log(`[cleanup] listing incomplete, deleted nothing: ${reason}`);
		Sentry.captureMessage("cleanup job: listing incomplete, deleted nothing", {
			level: "warning",
			extra: { reason },
		});
		return { skipped: "listing incomplete", reason };
	}
	const ctx = { now, deps, boxes, drives, outOfTime, decide };
	const retired = new Set<string>();
	const rule1 = await retireWorkspaces({ ...ctx, retired });
	const rule2 = await pruneGoldens({ ...ctx, retired });
	const rule3 = await deleteLeftovers({ ...ctx, retired });
	const run = { rule1, rule2, rule3 };
	deps.log(`[cleanup] run ${JSON.stringify(run)}`);
	Sentry.logger.info("retention.run", flatten(run));
	if (
		rule1.failed ||
		rule2.failed ||
		rule3.boxes.failed ||
		rule3.drives.failed ||
		rule3.agentsDrives.failed
	) {
		Sentry.captureMessage("cleanup job run had failures", {
			level: "warning",
			extra: { ...run },
		});
	}
	return run;
}

type Ctx = {
	now: number;
	deps: RetentionDeps;
	boxes: ListedSandbox[];
	drives: ListedDrive[];
	outOfTime: () => boolean;
	decide: (decision: Decision) => void;
	retired: Set<string>;
};

async function retireWorkspaces({
	now,
	deps,
	boxes,
	outOfTime,
	decide,
	retired,
}: Ctx) {
	const status = new Map(boxes.map((box) => [box.name, box.status]));
	const rows = await deps.findPastWait({
		now,
		listedNames: boxes.map((box) => box.name),
		limit: RETIRE_BATCH,
	});
	const counts = {
		found: perStatus(),
		retired: perStatus(),
		skippedRunning: 0,
		skippedChanged: 0,
		deferred: 0,
		failed: 0,
	};
	for (const row of rows) counts.found[row.status]++;
	for (const [index, row] of rows.entries()) {
		if (outOfTime()) {
			counts.deferred = rows.length - index;
			break;
		}
		const name = `${row.id} (${row.providerSandboxId})`;
		try {
			// With billing off no boot row guards a wake in flight; the listing does.
			if (
				row.status === "asleep" &&
				RUNNING_STATUSES.has(status.get(row.providerSandboxId) ?? "")
			) {
				counts.skippedRunning++;
				decide({
					rule: 1,
					kind: "workspace",
					name,
					action: "keep",
					reason: "asleep past its wait, but its box runs a session now",
				});
				continue;
			}
			if (!(await deps.retireWorkspace(row, now))) {
				counts.skippedChanged++;
				decide({
					rule: 1,
					kind: "workspace",
					name,
					action: "keep",
					reason: `no longer ${row.status} past its wait: changed since it was read`,
				});
				continue;
			}
			counts.retired[row.status]++;
			retired.add(row.providerSandboxId);
			decide({
				rule: 1,
				kind: "workspace",
				name,
				action: "delete",
				reason: `${row.status} for more than ${WAIT_MS[row.status] / DAY_MS} days`,
			});
			await deps.pause(TEARDOWN_SPACING_MS);
		} catch (error) {
			counts.failed++;
			Sentry.captureException(error, {
				tags: { "cloud_workspace.id": row.id },
			});
		}
	}
	return counts;
}

async function pruneGoldens({ deps, boxes, outOfTime, decide, retired }: Ctx) {
	const listed = new Set(boxes.map((box) => box.name));
	const envs = await deps.listEnvironmentGoldens();
	const counts = {
		environments: envs.length,
		kept: 0,
		deleted: 0,
		deferred: 0,
		failed: 0,
	};
	const due: string[] = [];
	for (const env of envs) {
		const drop = new Set(
			env.archived
				? env.goldens
				: goldensToDelete(
						env.goldens.map((goldenRef) => ({ goldenRef })),
						env.activeRef ?? "",
					).map((golden) => golden.goldenRef),
		);
		for (const golden of env.goldens) {
			if (drop.has(golden) && listed.has(golden)) {
				due.push(golden);
				continue;
			}
			if (drop.has(golden)) continue;
			counts.kept++;
			decide({
				rule: 2,
				kind: "golden",
				name: golden,
				action: "keep",
				reason:
					golden === env.activeRef
						? `active golden of environment ${env.id}`
						: `among the newest goldens of environment ${env.id}`,
			});
		}
	}
	const shared = await deps.namedByLiveRow(due);
	const batch = due.filter((name) => !shared.has(name) && !retired.has(name));
	for (const name of due.filter((name) => shared.has(name))) {
		counts.kept++;
		decide({
			rule: 2,
			kind: "golden",
			name,
			action: "keep",
			reason: "a live workspace or environment still names it",
		});
	}
	const work = batch.slice(0, GOLDEN_BATCH);
	counts.deferred = batch.length - work.length;
	for (const [index, name] of work.entries()) {
		if (outOfTime()) {
			counts.deferred += work.length - index;
			break;
		}
		try {
			await deps.tearDownBox(name);
			retired.add(name);
			counts.deleted++;
			decide({
				rule: 2,
				kind: "golden",
				name,
				action: "delete",
				reason: "its environment is archived or keeps newer goldens",
			});
			await deps.pause(TEARDOWN_SPACING_MS);
		} catch (error) {
			counts.failed++;
			Sentry.captureException(error, { extra: { golden: name } });
		}
	}
	return counts;
}

async function deleteLeftovers(ctx: Ctx) {
	return {
		boxes: await deleteLeftoverBoxes(ctx),
		...(await deleteLeftoverDrives(ctx)),
	};
}

async function deleteLeftoverBoxes({
	now,
	deps,
	boxes,
	outOfTime,
	decide,
	retired,
}: Ctx): Promise<Counts> {
	const counts = { kept: 0, deleted: 0, deferred: 0, failed: 0 };
	const fresh = boxes.filter((box) => !retired.has(box.name));
	const named = await deps.namedByAnyRow(fresh.map((box) => box.name));
	const due: string[] = [];
	for (const box of fresh) {
		const reason = named.has(box.name)
			? "a production row names it"
			: now - box.createdAt < LEFTOVER_AGE_MS
				? "made less than 7 days ago"
				: null;
		if (reason) {
			counts.kept++;
			decide({ rule: 3, kind: "box", name: box.name, action: "keep", reason });
		} else {
			due.push(box.name);
		}
	}
	const work = due.slice(0, LEFTOVER_BOX_BATCH);
	counts.deferred = due.length - work.length;
	for (const [index, name] of work.entries()) {
		if (outOfTime()) {
			counts.deferred += work.length - index;
			break;
		}
		try {
			await deps.tearDownBox(name);
			counts.deleted++;
			decide({
				rule: 3,
				kind: "box",
				name,
				action: "delete",
				reason: "no production row names it, made more than 7 days ago",
			});
			await deps.pause(TEARDOWN_SPACING_MS);
		} catch (error) {
			counts.failed++;
			Sentry.captureException(error, { extra: { providerSandboxId: name } });
		}
	}
	return counts;
}

async function deleteLeftoverDrives({
	now,
	deps,
	boxes,
	drives,
	outOfTime,
	decide,
}: Ctx): Promise<{ drives: Counts; agentsDrives: Counts }> {
	const mountedBy = new Map<string, string>();
	for (const box of boxes) {
		for (const drive of box.mounts) mountedBy.set(drive, box.name);
	}
	const current = await deps.currentBundleSha();
	const workspaceDrives = drives.filter(
		(drive) => !SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(drive.name),
	);
	const named = await deps.namedDrives(workspaceDrives.map((d) => d.name));
	const keepReason = (drive: ListedDrive): string | null => {
		const mounter = mountedBy.get(drive.name);
		if (mounter) return `mounted by box ${mounter}`;
		if (drive.attachedTo) return `attached to ${drive.attachedTo}`;
		if (SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(drive.name)) {
			if (!current) return "no current release recorded";
			if (drive.name.endsWith(`-${current.slice(0, 12)}`)) {
				return "the current release's";
			}
			if (now - drive.createdAt < NEW_AGENTS_DRIVE_MS) {
				return "published less than a day ago: its release may not be recorded yet";
			}
			return null;
		}
		if (named.has(drive.name)) return "a production row names it";
		if (now - drive.createdAt < LEFTOVER_AGE_MS) {
			return "made less than 7 days ago";
		}
		return null;
	};
	const results = {
		drives: { kept: 0, deleted: 0, deferred: 0, failed: 0 },
		agentsDrives: { kept: 0, deleted: 0, deferred: 0, failed: 0 },
	};
	let started = 0;
	for (const drive of drives) {
		const agents = SANDBOX_AGENT_TOOLS_DRIVE_PATTERN.test(drive.name);
		const counts = agents ? results.agentsDrives : results.drives;
		const kind = agents ? "agents drive" : "drive";
		const reason = keepReason(drive);
		if (reason) {
			counts.kept++;
			decide({ rule: 3, kind, name: drive.name, action: "keep", reason });
			continue;
		}
		if (started >= DRIVE_BATCH || outOfTime()) {
			counts.deferred++;
			continue;
		}
		started++;
		try {
			await deps.deleteDrive(drive.name);
			counts.deleted++;
			decide({
				rule: 3,
				kind,
				name: drive.name,
				action: "delete",
				reason: agents
					? "not the current release's, and no box mounts it"
					: "no production row names it and no box mounts it, made more than 7 days ago",
			});
		} catch (error) {
			counts.failed++;
			decide({
				rule: 3,
				kind,
				name: drive.name,
				action: "keep",
				reason: `Vercel refused the delete: ${String(error).slice(0, 200)}`,
			});
		}
	}
	return results;
}

function flatten(value: object, prefix = ""): Record<string, number | string> {
	const flat: Record<string, number | string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry && typeof entry === "object") {
			Object.assign(flat, flatten(entry, `${prefix}${key}.`));
		} else {
			flat[`${prefix}${key}`] = entry;
		}
	}
	return flat;
}
