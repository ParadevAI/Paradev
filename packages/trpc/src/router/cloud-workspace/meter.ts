import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/core";
import { autumnClient, billingUsesAutumn } from "@superset/auth/autumn";
import {
	ACTIVE_CPU_MINUTES_FEATURE_ID,
	BOX_GB_MINUTES_FEATURE_ID,
	ensureAutumnCustomer,
} from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { recordUsageEvent } from "@superset/db/cloud-usage-events";
import type {
	CloudUsageFeature,
	CloudWorkspaceBootOrigin,
} from "@superset/db/enums";
import {
	cloudWorkspaceBoots,
	cloudWorkspaces,
	users,
} from "@superset/db/schema";
import { AutumnError } from "autumn-js";
import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { controlTags, logControl } from "../../lib/control-log";
import { nudge } from "../../lib/realtime";
import {
	type ActiveWorkspaceSandbox,
	findSandboxSession,
	listSandboxSessions,
	MEMORY_MB_PER_VCPU,
	stopSandbox,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import { recordBootEnd, recordSandboxAsleep } from "./sandbox-sleep";

const LOCK_WINDOW_MS = 30 * 60 * 1000;
const LOCK_TTL_MS = 70 * 60 * 1000;
const CAP_GRACE_MS = 10 * 60 * 1000;
const SETTLE_LEASE_MS = 2 * 60 * 1000;
const UNATTACHED_BOOT_GRACE_MS = 60 * 60 * 1000;
const ADOPT_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const RECONCILE_CONCURRENCY = 25;

export function boxFor(vcpus: number): { memoryMb: number; vcpus: number } {
	return { memoryMb: vcpus * MEMORY_MB_PER_VCPU, vcpus };
}

type Boot = typeof cloudWorkspaceBoots.$inferSelect;
type UsageUser = { id: string; name: string | null; email: string | null };
type Refusal = "cloudNeedsPaidPlan" | "usageLimitReached";

export function gbMinutes({
	ms,
	memoryMb,
}: {
	ms: number;
	memoryMb: number;
}): number {
	return (Math.max(0, ms) / 60_000) * (memoryMb / 1024);
}

export function lockIdFor(bootId: string, seq: number): string {
	return `${bootId}:${seq}`;
}

export function refusalFor(result: {
	allowed: boolean;
	balance: unknown;
}): Refusal | null {
	if (result.allowed) return null;
	return result.balance ? "usageLimitReached" : "cloudNeedsPaidPlan";
}

const REFUSAL_MESSAGES: Record<Refusal, string> = {
	cloudNeedsPaidPlan:
		"Cloud workspaces need the Team or Ultra plan. Upgrade in Settings, Billing to start one.",
	usageLimitReached:
		"Your organization has reached its cloud usage limit. Raise the limit or upgrade in Settings, Billing to start this workspace.",
};

function refusalError(refusal: Refusal) {
	return userError({
		code: "FORBIDDEN",
		message: REFUSAL_MESSAGES[refusal],
		i18nKey: `serverError.cloudWorkspace.${refusal}`,
	});
}

function reservation(memoryMb: number): number {
	return gbMinutes({ ms: LOCK_WINDOW_MS, memoryMb });
}

function reserveLock(
	boot: Pick<Boot, "id" | "lockSeq" | "organizationId" | "cloudWorkspaceId">,
	memoryMb: number,
	user: UsageUser | null,
) {
	return autumnClient.check({
		customerId: boot.organizationId,
		featureId: BOX_GB_MINUTES_FEATURE_ID,
		requiredBalance: reservation(memoryMb),
		properties: usageProperties(boot, user),
		lock: {
			enabled: true,
			lockId: lockIdFor(boot.id, boot.lockSeq),
			expiresAt: Date.now() + LOCK_TTL_MS,
		},
	});
}

function usageProperties(
	boot: Pick<Boot, "id" | "lockSeq" | "cloudWorkspaceId">,
	user: UsageUser | null,
) {
	return {
		bootId: boot.id,
		lockSeq: boot.lockSeq,
		meteringVersion: 1,
		workspaceId: boot.cloudWorkspaceId,
		userId: user?.id ?? "unattributed",
		...(user?.name ? { userName: user.name } : {}),
		...(user?.email ? { userEmail: user.email } : {}),
	};
}

async function usageUser(userId: string | null): Promise<UsageUser | null> {
	if (!userId) return null;
	const [user] = await db
		.select({ name: users.name, email: users.email })
		.from(users)
		.where(eq(users.id, userId));
	return { id: userId, name: user?.name ?? null, email: user?.email ?? null };
}

const OPEN_BOOT = or(
	isNull(cloudWorkspaceBoots.stoppedAt),
	isNull(cloudWorkspaceBoots.finalizedThrough),
	lt(cloudWorkspaceBoots.finalizedThrough, cloudWorkspaceBoots.stoppedAt),
);

async function checkOrFailOpen<T>(
	organizationId: string,
	check: () => Promise<T>,
): Promise<T | null> {
	try {
		await ensureAutumnCustomer(organizationId);
		return await check();
	} catch (error) {
		Sentry.captureException(error, {
			tags: { "organization.id": organizationId },
		});
		return null;
	}
}

function isUniqueViolation(error: unknown): boolean {
	const { code, cause } = error as { code?: string; cause?: { code?: string } };
	return code === "23505" || cause?.code === "23505";
}

export async function assertMayBoot(
	organizationId: string,
	vcpus: number,
): Promise<void> {
	if (!billingUsesAutumn) return;
	const box = boxFor(vcpus);
	const result = await checkOrFailOpen(organizationId, () =>
		autumnClient.check({
			customerId: organizationId,
			featureId: BOX_GB_MINUTES_FEATURE_ID,
			requiredBalance: reservation(box.memoryMb),
		}),
	);
	if (!result) return;
	const refusal = refusalFor(result);
	if (refusal) throw refusalError(refusal);
}

export async function authorizeBoot(
	args: {
		organizationId: string;
		cloudWorkspaceId: string;
		createdByUserId: string | null;
		memoryMb: number;
		vcpus: number;
		origin: CloudWorkspaceBootOrigin;
	},
	{ billingEnabled = billingUsesAutumn }: { billingEnabled?: boolean } = {},
): Promise<{ bootId: string | null }> {
	if (!billingEnabled) return { bootId: null };
	const bootId = `boot_${randomUUID()}`;
	const user = await usageUser(args.createdByUserId);
	const result = await checkOrFailOpen(args.organizationId, () =>
		reserveLock(
			{
				id: bootId,
				lockSeq: 0,
				organizationId: args.organizationId,
				cloudWorkspaceId: args.cloudWorkspaceId,
			},
			args.memoryMb,
			user,
		),
	);
	const scope = {
		cloudWorkspaceId: args.cloudWorkspaceId,
		organizationId: args.organizationId,
	};
	const refusal = result && refusalFor(result);
	if (refusal) {
		logControl("boot.refused", scope, { refusal }, "warn");
		throw refusalError(refusal);
	}
	await db.insert(cloudWorkspaceBoots).values({
		id: bootId,
		organizationId: args.organizationId,
		cloudWorkspaceId: args.cloudWorkspaceId,
		memoryMb: args.memoryMb,
		vcpus: args.vcpus,
		startedAt: new Date(),
		lockOpen: result !== null,
		createdByUserId: args.createdByUserId,
		origin: args.origin,
	});
	logControl(
		"boot.authorized",
		{ ...scope, bootId },
		{
			"box.vcpus": args.vcpus,
			"box.memory_mb": args.memoryMb,
			"lock.open": result !== null,
		},
	);
	return { bootId };
}

type BootReleaseCause =
	| "provision_failed"
	| "provision_abandoned"
	| "session_taken"
	| "never_attached"
	| "sandbox_lost";

export async function releaseBoot(
	bootId: string,
	cause: BootReleaseCause,
): Promise<void> {
	const [boot] = await db
		.select()
		.from(cloudWorkspaceBoots)
		.where(eq(cloudWorkspaceBoots.id, bootId));
	if (!boot || boot.stoppedAt) return;
	if (boot.lockOpen) {
		await autumnClient.balances
			.finalize({
				lockId: lockIdFor(boot.id, boot.lockSeq),
				action: "release",
			})
			.catch((error) =>
				console.error(
					`[cloud-workspace/meter] release of ${bootId} failed`,
					error,
				),
			);
	}
	const endReason =
		boot.endReason ?? (cause === "provision_failed" ? "failed" : "released");
	const now = new Date();
	await db
		.update(cloudWorkspaceBoots)
		.set({
			stoppedAt: now,
			finalizedThrough: now,
			lockOpen: false,
			settleLeaseUntil: null,
			endReason: sql`coalesce(${cloudWorkspaceBoots.endReason}, ${endReason})`,
		})
		.where(eq(cloudWorkspaceBoots.id, bootId));
	if (boot.cloudWorkspaceId) {
		logControl(
			"boot.released",
			{
				cloudWorkspaceId: boot.cloudWorkspaceId,
				organizationId: boot.organizationId,
				bootId,
			},
			{ "end.reason": endReason, "release.cause": cause },
		);
	}
}

export async function attachBootSession(args: {
	bootId: string;
	providerSandboxId: string;
}): Promise<void> {
	const found = await findSandboxSession(args.providerSandboxId, null);
	const session = found?.session;
	if (!session) return;
	const attached = await db
		.update(cloudWorkspaceBoots)
		.set({
			vercelSessionId: session.id,
			startedAt: new Date(session.startedAt),
			memoryMb: session.memoryMb,
			vcpus: session.vcpus,
		})
		.where(
			and(
				eq(cloudWorkspaceBoots.id, args.bootId),
				isNull(cloudWorkspaceBoots.vercelSessionId),
				sql`not exists (select 1 from ${cloudWorkspaceBoots} other where other.vercel_session_id = ${session.id})`,
			),
		)
		.returning({ id: cloudWorkspaceBoots.id })
		.catch((error) => {
			if (isUniqueViolation(error)) return [];
			throw error;
		});
	if (attached.length > 0) return;
	const [current] = await db
		.select({ vercelSessionId: cloudWorkspaceBoots.vercelSessionId })
		.from(cloudWorkspaceBoots)
		.where(eq(cloudWorkspaceBoots.id, args.bootId));
	if (current?.vercelSessionId === session.id) return;
	await releaseBoot(args.bootId, "session_taken");
}

function bootTags(boot: Boot): Record<string, string> {
	return {
		"organization.id": boot.organizationId,
		"boot.id": boot.id,
		...(boot.cloudWorkspaceId
			? { "cloud_workspace.id": boot.cloudWorkspaceId }
			: {}),
	};
}

type UsageWindow = {
	from: number;
	to: number;
	amount: number;
	user: UsageUser | null;
};

async function recordSentUsage(
	boot: Boot,
	feature: CloudUsageFeature,
	window: UsageWindow,
): Promise<void> {
	await recordUsageEvent(db, {
		bootId: boot.id,
		lockSeq: boot.lockSeq,
		feature,
		organizationId: boot.organizationId,
		cloudWorkspaceId: boot.cloudWorkspaceId,
		userId: window.user?.id ?? null,
		windowFrom: new Date(window.from),
		windowTo: new Date(window.to),
		amount: String(window.amount),
		sentAt: new Date(),
	}).catch((error) => {
		Sentry.captureException(error, {
			tags: bootTags(boot),
			extra: { feature, lockSeq: boot.lockSeq },
		});
	});
}

/**
 * Autumn can apply a confirm and still answer 503; the retry then finds no lock.
 * A lock taken less than its lifetime ago cannot have expired, so that confirm went through.
 */
function confirmedEarlier(boot: Boot, error: AutumnError): boolean {
	const takenAt = boot.finalizedThrough ?? boot.createdAt;
	return (
		error.body.includes("Lock not found") &&
		Date.now() < takenAt.getTime() + LOCK_TTL_MS - LOCK_WINDOW_MS
	);
}

async function recordUsage(boot: Boot, window: UsageWindow): Promise<void> {
	const { amount } = window;
	const properties = usageProperties(boot, window.user);
	const lockId = lockIdFor(boot.id, boot.lockSeq);
	if (boot.lockOpen) {
		try {
			await autumnClient.balances.finalize(
				// Finalization inherits the original reservation's attribution, including on expiry.
				{ lockId, action: "confirm", overrideValue: amount },
				{ headers: { "Idempotency-Key": `${lockId}:confirm` } },
			);
			return recordSentUsage(boot, BOX_GB_MINUTES_FEATURE_ID, window);
		} catch (error) {
			if (!(error instanceof AutumnError)) throw error;
			if (error.statusCode === 409 || confirmedEarlier(boot, error)) {
				return recordSentUsage(boot, BOX_GB_MINUTES_FEATURE_ID, window);
			}
			if (error.statusCode >= 500) throw error;
			Sentry.captureException(error, {
				tags: bootTags(boot),
				extra: { lockId },
			});
		}
	}
	if (amount <= 0) return;
	try {
		await autumnClient.track(
			{
				customerId: boot.organizationId,
				featureId: BOX_GB_MINUTES_FEATURE_ID,
				value: amount,
				overageBehavior: "overflow",
				async: false,
				properties,
			},
			{ headers: { "Idempotency-Key": `${lockId}:track:${window.from}` } },
		);
	} catch (error) {
		if (!(error instanceof AutumnError && error.statusCode === 409))
			throw error;
	}
	await recordSentUsage(boot, BOX_GB_MINUTES_FEATURE_ID, window);
}

async function claimSettle(bootId: string): Promise<Boot | null> {
	const [boot] = await db
		.update(cloudWorkspaceBoots)
		.set({ settleLeaseUntil: new Date(Date.now() + SETTLE_LEASE_MS) })
		.where(
			and(
				eq(cloudWorkspaceBoots.id, bootId),
				or(
					isNull(cloudWorkspaceBoots.settleLeaseUntil),
					lt(cloudWorkspaceBoots.settleLeaseUntil, new Date()),
				),
				OPEN_BOOT,
			),
		)
		.returning();
	return boot ?? null;
}

function clearLease(bootId: string) {
	return db
		.update(cloudWorkspaceBoots)
		.set({ settleLeaseUntil: null })
		.where(eq(cloudWorkspaceBoots.id, bootId));
}

async function recordActiveCpu(boot: Boot, window: UsageWindow) {
	try {
		await autumnClient.track(
			{
				customerId: boot.organizationId,
				featureId: ACTIVE_CPU_MINUTES_FEATURE_ID,
				value: window.amount,
				async: false,
				properties: usageProperties(boot, window.user),
			},
			{ headers: { "Idempotency-Key": `${boot.id}:active-cpu` } },
		);
	} catch (error) {
		if (!(error instanceof AutumnError && error.statusCode === 409))
			throw error;
	}
	await recordSentUsage(boot, ACTIVE_CPU_MINUTES_FEATURE_ID, window);
}

/**
 * Bills a boot's GB-minutes since its last settle against its current lock,
 * then takes the next lock while the box runs, or closes the boot once it
 * stopped. A refused renewal stops the box at the spend cap.
 */
export async function settleBoot(
	bootId: string,
): Promise<"renewed" | "warned" | "stopped" | "closed" | "skipped"> {
	const boot = await claimSettle(bootId);
	if (!boot) return "skipped";
	try {
		const [workspace] = boot.cloudWorkspaceId
			? await db
					.select({
						providerSandboxId: cloudWorkspaces.providerSandboxId,
						createdByUserId: cloudWorkspaces.createdByUserId,
						usageStopAt: cloudWorkspaces.usageStopAt,
						userName: users.name,
						userEmail: users.email,
					})
					.from(cloudWorkspaces)
					.leftJoin(users, eq(users.id, cloudWorkspaces.createdByUserId))
					.where(eq(cloudWorkspaces.id, boot.cloudWorkspaceId))
			: [];
		if (!boot.vercelSessionId) {
			if (
				workspace &&
				Date.now() - boot.createdAt.getTime() < UNATTACHED_BOOT_GRACE_MS
			) {
				await attachBootSession({
					bootId,
					providerSandboxId: workspace.providerSandboxId,
				});
				await clearLease(bootId);
				return "skipped";
			}
			await releaseBoot(bootId, "never_attached");
			return "closed";
		}
		const found = workspace
			? await findSandboxSession(
					workspace.providerSandboxId,
					boot.vercelSessionId,
				)
			: null;
		if (!found?.session) {
			Sentry.captureMessage(
				`[cloud-workspace/meter] boot ${bootId} lost its sandbox; unsettled minutes released`,
			);
			await releaseBoot(bootId, "sandbox_lost");
			return "closed";
		}
		const { session } = found;
		const user = workspace?.createdByUserId
			? {
					id: workspace.createdByUserId,
					name: workspace.userName,
					email: workspace.userEmail,
				}
			: null;
		const end = session.endedAt ?? Date.now();
		const from = (
			boot.finalizedThrough ?? new Date(session.startedAt)
		).getTime();
		await recordUsage(boot, {
			from,
			to: end,
			amount: gbMinutes({ ms: end - from, memoryMb: session.memoryMb }),
			user,
		});
		await db
			.update(cloudWorkspaceBoots)
			.set({ finalizedThrough: new Date(end), lockOpen: false })
			.where(eq(cloudWorkspaceBoots.id, bootId));

		if (session.endedAt !== null) {
			if (session.activeCpuMs) {
				await recordActiveCpu(boot, {
					from: session.startedAt,
					to: end,
					amount: session.activeCpuMs / 60_000,
					user,
				});
			}
			await db
				.update(cloudWorkspaceBoots)
				.set({
					stoppedAt: new Date(end),
					settleLeaseUntil: null,
					activeCpuMs: session.activeCpuMs,
					egressBytes: session.egressBytes,
					endReason: session.crashed
						? "crashed"
						: sql`coalesce(${cloudWorkspaceBoots.endReason}, 'unknown')`,
				})
				.where(eq(cloudWorkspaceBoots.id, bootId));
			if (workspace?.usageStopAt && !(await otherOpenBoot(boot))) {
				await setUsageStopAt(boot, null);
			}
			return "closed";
		}

		const nextSeq = boot.lockSeq + 1;
		const renewal = await reserveLock(
			{ ...boot, lockSeq: nextSeq },
			session.memoryMb,
			user,
		);
		await db
			.update(cloudWorkspaceBoots)
			.set({
				lockSeq: nextSeq,
				lockOpen: renewal.allowed,
				settleLeaseUntil: null,
			})
			.where(eq(cloudWorkspaceBoots.id, bootId));
		if (!workspace || !boot.cloudWorkspaceId) {
			return renewal.allowed ? "renewed" : "stopped";
		}
		const stopAt = workspace.usageStopAt;
		const scope = {
			cloudWorkspaceId: boot.cloudWorkspaceId,
			organizationId: boot.organizationId,
			bootId,
		};
		if (renewal.allowed) {
			if (stopAt) await setUsageStopAt(boot, null);
			return "renewed";
		}
		if (!stopAt) {
			await setUsageStopAt(boot, new Date(Date.now() + CAP_GRACE_MS));
			logControl(
				"meter.cap_reached",
				scope,
				{ stop_in_ms: CAP_GRACE_MS },
				"warn",
			);
			await queueSettle(bootId, CAP_GRACE_MS / 1000);
			return "warned";
		}
		if (stopAt.getTime() > Date.now()) return "warned";
		const stopped = await stopSandbox(workspace.providerSandboxId);
		const sessionId = stopped.sessionId ?? boot.vercelSessionId;
		await recordSandboxAsleep(boot.cloudWorkspaceId, { sessionId });
		await recordBootEnd(boot.cloudWorkspaceId, {
			sessionId,
			reason: "usage_limit",
		});
		await setUsageStopAt(boot, null);
		logControl("meter.cap_stopped", scope, { source: "settle" }, "warn");
		return "stopped";
	} catch (error) {
		await clearLease(bootId);
		throw error;
	}
}

async function openBootIds(cloudWorkspaceId?: string): Promise<string[]> {
	const rows = await db
		.select({ id: cloudWorkspaceBoots.id })
		.from(cloudWorkspaceBoots)
		.where(
			cloudWorkspaceId
				? and(
						eq(cloudWorkspaceBoots.cloudWorkspaceId, cloudWorkspaceId),
						OPEN_BOOT,
					)
				: OPEN_BOOT,
		);
	return rows.map((row) => row.id);
}

async function otherOpenBoot(boot: Boot): Promise<boolean> {
	if (!boot.cloudWorkspaceId) return false;
	const [other] = await db
		.select({ id: cloudWorkspaceBoots.id })
		.from(cloudWorkspaceBoots)
		.where(
			and(
				eq(cloudWorkspaceBoots.cloudWorkspaceId, boot.cloudWorkspaceId),
				ne(cloudWorkspaceBoots.id, boot.id),
				isNull(cloudWorkspaceBoots.stoppedAt),
			),
		)
		.limit(1);
	return Boolean(other);
}

async function setUsageStopAt(boot: Boot, at: Date | null): Promise<void> {
	if (!boot.cloudWorkspaceId) return;
	await db
		.update(cloudWorkspaces)
		.set({ usageStopAt: at })
		.where(eq(cloudWorkspaces.id, boot.cloudWorkspaceId));
	nudge(boot.organizationId, "cloud_workspaces");
}

function queueSettle(bootId: string, delaySeconds?: number): Promise<void> {
	return publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/meter",
		body: { bootId },
		...(delaySeconds ? { delaySeconds } : {}),
		runLocally: (body) => settleBoot(body.bootId),
	});
}

export async function queueSettleWorkspace(
	cloudWorkspaceId: string,
): Promise<void> {
	const ids = await openBootIds(cloudWorkspaceId).catch((error) => {
		console.error(
			`[cloud-workspace/meter] could not list boots of ${cloudWorkspaceId}`,
			error,
		);
		return [];
	});
	await Promise.all(
		ids.map((id) =>
			queueSettle(id).catch((error) =>
				console.error(`[cloud-workspace/meter] could not queue ${id}`, error),
			),
		),
	);
}

export async function settleOrganizationNow(
	organizationId: string,
): Promise<void> {
	const rows = await db
		.select({
			id: cloudWorkspaceBoots.id,
			vercelSessionId: cloudWorkspaceBoots.vercelSessionId,
			cloudWorkspaceId: cloudWorkspaces.id,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
		})
		.from(cloudWorkspaceBoots)
		.leftJoin(
			cloudWorkspaces,
			eq(cloudWorkspaces.id, cloudWorkspaceBoots.cloudWorkspaceId),
		)
		.where(
			and(eq(cloudWorkspaceBoots.organizationId, organizationId), OPEN_BOOT),
		);
	await Promise.all(
		rows.map(({ id, vercelSessionId, cloudWorkspaceId, providerSandboxId }) =>
			cloudWorkspaceId && providerSandboxId
				? stopSandbox(providerSandboxId)
						.then(async (stopped) => {
							const sessionId = stopped.sessionId ?? vercelSessionId;
							await recordSandboxAsleep(cloudWorkspaceId, { sessionId });
							await recordBootEnd(cloudWorkspaceId, {
								sessionId,
								reason: "archived",
							});
						})
						.catch((error) =>
							Sentry.captureException(error, {
								tags: controlTags({
									cloudWorkspaceId,
									organizationId,
									bootId: id,
								}),
							}),
						)
				: undefined,
		),
	);
	const failures: unknown[] = [];
	for (const { id } of rows) {
		await settleBoot(id).catch((error) => failures.push(error));
	}
	if (failures.length > 0) {
		throw new AggregateError(
			failures,
			`${failures.length} of ${rows.length} boots of ${organizationId} not settled`,
		);
	}
}

export async function settleWorkspaceNow(
	cloudWorkspaceId: string,
): Promise<void> {
	for (const id of await openBootIds(cloudWorkspaceId)) {
		await settleBoot(id);
	}
}

async function adoptRunningBoxes(
	active: ActiveWorkspaceSandbox[],
): Promise<number> {
	const names = active.map((box) => box.name);
	if (names.length === 0) return 0;
	const unmetered = await db
		.select({
			id: cloudWorkspaces.id,
			organizationId: cloudWorkspaces.organizationId,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
			createdByUserId: cloudWorkspaces.createdByUserId,
		})
		.from(cloudWorkspaces)
		.where(
			and(
				eq(cloudWorkspaces.provider, "vercel"),
				ne(cloudWorkspaces.status, "failed"),
				inArray(cloudWorkspaces.providerSandboxId, names),
			),
		);
	const adoptSessions = async (workspace: (typeof unmetered)[number]) => {
		const sessions = await listSandboxSessions(
			workspace.providerSandboxId,
			Date.now() - ADOPT_LOOKBACK_MS,
		);
		if (!sessions?.length) return 0;
		const boots = await db
			.select({ vercelSessionId: cloudWorkspaceBoots.vercelSessionId })
			.from(cloudWorkspaceBoots)
			.where(
				or(
					inArray(
						cloudWorkspaceBoots.vercelSessionId,
						sessions.map((session) => session.id),
					),
					and(
						eq(cloudWorkspaceBoots.cloudWorkspaceId, workspace.id),
						isNull(cloudWorkspaceBoots.vercelSessionId),
						isNull(cloudWorkspaceBoots.stoppedAt),
						gt(
							cloudWorkspaceBoots.createdAt,
							new Date(Date.now() - UNATTACHED_BOOT_GRACE_MS),
						),
					),
				),
			);
		const metered = new Set(boots.map((boot) => boot.vercelSessionId));
		let adopted = 0;
		for (const [index, session] of sessions.entries()) {
			// An open boot with no session yet attaches the newest one itself.
			if (metered.has(session.id) || (index === 0 && metered.has(null))) {
				continue;
			}
			const bootId = `boot_${randomUUID()}`;
			const lock =
				session.endedAt === null
					? await checkOrFailOpen(workspace.organizationId, async () =>
							reserveLock(
								{
									id: bootId,
									lockSeq: 0,
									organizationId: workspace.organizationId,
									cloudWorkspaceId: workspace.id,
								},
								session.memoryMb,
								await usageUser(workspace.createdByUserId),
							),
						)
					: null;
			const lockOpen = lock?.allowed === true;
			let inserted: { id: string }[] = [];
			try {
				inserted = await db
					.insert(cloudWorkspaceBoots)
					.values({
						id: bootId,
						organizationId: workspace.organizationId,
						cloudWorkspaceId: workspace.id,
						vercelSessionId: session.id,
						memoryMb: session.memoryMb,
						vcpus: session.vcpus,
						startedAt: new Date(session.startedAt),
						lockOpen,
						createdByUserId: workspace.createdByUserId,
						origin: "adopt",
					})
					.onConflictDoNothing({ target: cloudWorkspaceBoots.vercelSessionId })
					.returning({ id: cloudWorkspaceBoots.id });
			} finally {
				if (inserted.length === 0 && lockOpen) {
					await autumnClient.balances.finalize({
						lockId: lockIdFor(bootId, 0),
						action: "release",
					});
				}
			}
			if (inserted.length === 0) continue;
			adopted += 1;
			await queueSettle(bootId);
			if (!lock || lockOpen) continue;
			console.error(
				`[cloud-workspace/meter] ${workspace.id} runs past its limit; stopping it`,
			);
			const stopped = await stopSandbox(workspace.providerSandboxId);
			const sessionId = stopped.sessionId ?? session.id;
			await recordSandboxAsleep(workspace.id, { sessionId });
			await recordBootEnd(workspace.id, { sessionId, reason: "usage_limit" });
			logControl(
				"meter.cap_stopped",
				{
					cloudWorkspaceId: workspace.id,
					organizationId: workspace.organizationId,
				},
				{ source: "reconcile" },
				"warn",
			);
		}
		return adopted;
	};
	let adopted = 0;
	for (let i = 0; i < unmetered.length; i += RECONCILE_CONCURRENCY) {
		const batch = unmetered.slice(i, i + RECONCILE_CONCURRENCY);
		const results = await Promise.allSettled(batch.map(adoptSessions));
		for (const [index, result] of results.entries()) {
			if (result.status === "fulfilled") adopted += result.value;
			else {
				const workspace = batch[index] as (typeof unmetered)[number];
				Sentry.captureException(result.reason, {
					tags: controlTags({
						cloudWorkspaceId: workspace.id,
						organizationId: workspace.organizationId,
					}),
				});
			}
		}
	}
	return adopted;
}

/**
 * Queues a settle for every open boot, then opens a boot for every recent
 * session that has none (a box resumed by a call no one authorized).
 */
export async function reconcileCloudWorkspaceUsage({
	active = null,
	billingEnabled = billingUsesAutumn,
}: {
	/** Workspace boxes whose state changed lately; null when the listing failed. */
	active?: ActiveWorkspaceSandbox[] | null;
	billingEnabled?: boolean;
} = {}): Promise<{
	adopted: number;
	queued: number;
	failed: number;
}> {
	if (!billingEnabled) return { adopted: 0, queued: 0, failed: 0 };
	const ids = await openBootIds();
	let failed = 0;
	for (let i = 0; i < ids.length; i += RECONCILE_CONCURRENCY) {
		const results = await Promise.allSettled(
			ids.slice(i, i + RECONCILE_CONCURRENCY).map(queueSettle),
		);
		for (const result of results) {
			if (result.status === "rejected") {
				failed += 1;
				console.error("[cloud-workspace/meter] queue failed", result.reason);
			}
		}
	}
	const adopted = active
		? await adoptRunningBoxes(active).catch((error) => {
				Sentry.captureException(error);
				return 0;
			})
		: 0;
	return { adopted, queued: ids.length - failed, failed };
}
