import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/core";
import { autumnClient, billingUsesAutumn } from "@superset/auth/autumn";
import {
	ACTIVE_CPU_MINUTES_FEATURE_ID,
	BOX_GB_MINUTES_FEATURE_ID,
	ensureAutumnCustomer,
} from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { cloudWorkspaceBoots, cloudWorkspaces } from "@superset/db/schema";
import { CLOUD_USAGE_REFUSAL_KEYS } from "@superset/shared/billing";
import { AutumnError } from "autumn-js";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { nudge } from "../../lib/realtime";
import {
	findSandboxSession,
	IMAGE_SANDBOX_VCPUS,
	listActiveWorkspaceSandboxes,
	MEMORY_MB_PER_VCPU,
	stopSandbox,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";

const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_TTL_MS = 40 * 60 * 1000;
const CAP_GRACE_MS = 10 * 60 * 1000;
const SETTLE_LEASE_MS = 2 * 60 * 1000;
const UNATTACHED_BOOT_GRACE_MS = 30 * 60 * 1000;
const RECONCILE_LOOKBACK_MS = 30 * 60 * 1000;
const RECONCILE_CONCURRENCY = 25;

export const DEFAULT_BOX = {
	memoryMb: IMAGE_SANDBOX_VCPUS * MEMORY_MB_PER_VCPU,
	vcpus: IMAGE_SANDBOX_VCPUS,
};

type Boot = typeof cloudWorkspaceBoots.$inferSelect;
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
		"Cloud workspaces need a paid plan. Upgrade in Settings, Billing to start one.",
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
		Sentry.captureException(error, { extra: { organizationId } });
		return null;
	}
}

function isUniqueViolation(error: unknown): boolean {
	const { code, cause } = error as { code?: string; cause?: { code?: string } };
	return code === "23505" || cause?.code === "23505";
}

export async function assertMayBoot(
	organizationId: string,
	box = DEFAULT_BOX,
): Promise<void> {
	if (!billingUsesAutumn) return;
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

export async function authorizeBoot(args: {
	organizationId: string;
	cloudWorkspaceId: string;
	memoryMb: number;
	vcpus: number;
}): Promise<{ bootId: string | null }> {
	if (!billingUsesAutumn) return { bootId: null };
	const bootId = `boot_${randomUUID()}`;
	const result = await checkOrFailOpen(args.organizationId, () =>
		autumnClient.check({
			customerId: args.organizationId,
			featureId: BOX_GB_MINUTES_FEATURE_ID,
			requiredBalance: reservation(args.memoryMb),
			lock: {
				enabled: true,
				lockId: lockIdFor(bootId, 0),
				expiresAt: Date.now() + LOCK_TTL_MS,
			},
		}),
	);
	const refusal = result && refusalFor(result);
	if (refusal) throw refusalError(refusal);
	await db.insert(cloudWorkspaceBoots).values({
		id: bootId,
		organizationId: args.organizationId,
		cloudWorkspaceId: args.cloudWorkspaceId,
		memoryMb: args.memoryMb,
		vcpus: args.vcpus,
		startedAt: new Date(),
		lockOpen: result !== null,
	});
	return { bootId };
}

export async function releaseBoot(bootId: string): Promise<void> {
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
	const now = new Date();
	await db
		.update(cloudWorkspaceBoots)
		.set({
			stoppedAt: now,
			finalizedThrough: now,
			lockOpen: false,
			settleLeaseUntil: null,
		})
		.where(eq(cloudWorkspaceBoots.id, bootId));
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
	if (attached.length === 0) await releaseBoot(args.bootId);
}

async function recordUsage(
	boot: Boot,
	window: { from: number; amount: number; userId: string | null },
): Promise<void> {
	const { amount } = window;
	const properties = {
		bootId: boot.id,
		lockSeq: boot.lockSeq,
		...(window.userId ? { userId: window.userId } : {}),
	};
	const lockId = lockIdFor(boot.id, boot.lockSeq);
	if (boot.lockOpen) {
		try {
			await autumnClient.balances.finalize(
				{ lockId, action: "confirm", overrideValue: amount, properties },
				{ headers: { "Idempotency-Key": `${lockId}:confirm` } },
			);
			return;
		} catch (error) {
			if (!(error instanceof AutumnError)) throw error;
			if (error.statusCode === 409) return;
			if (error.statusCode >= 500) throw error;
			Sentry.captureException(error, {
				extra: {
					bootId: boot.id,
					lockId,
					organizationId: boot.organizationId,
				},
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
		if (error instanceof AutumnError && error.statusCode === 409) return;
		throw error;
	}
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

async function recordActiveCpu(boot: Boot, activeCpuMs: number) {
	await autumnClient
		.track(
			{
				customerId: boot.organizationId,
				featureId: ACTIVE_CPU_MINUTES_FEATURE_ID,
				value: activeCpuMs / 60_000,
				async: false,
				properties: { bootId: boot.id },
			},
			{ headers: { "Idempotency-Key": `${boot.id}:active-cpu` } },
		)
		.catch((error) =>
			console.error(
				`[cloud-workspace/meter] CPU for ${boot.id} not recorded`,
				error,
			),
		);
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
					})
					.from(cloudWorkspaces)
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
			await releaseBoot(bootId);
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
			await releaseBoot(bootId);
			return "closed";
		}
		const { session } = found;
		const end = session.endedAt ?? Date.now();
		const from = (
			boot.finalizedThrough ?? new Date(session.startedAt)
		).getTime();
		await recordUsage(boot, {
			from,
			amount: gbMinutes({ ms: end - from, memoryMb: session.memoryMb }),
			userId: workspace?.createdByUserId ?? null,
		});
		await db
			.update(cloudWorkspaceBoots)
			.set({ finalizedThrough: new Date(end), lockOpen: false })
			.where(eq(cloudWorkspaceBoots.id, bootId));

		if (session.endedAt !== null) {
			if (session.activeCpuMs) await recordActiveCpu(boot, session.activeCpuMs);
			await db
				.update(cloudWorkspaceBoots)
				.set({ stoppedAt: new Date(end), settleLeaseUntil: null })
				.where(eq(cloudWorkspaceBoots.id, bootId));
			if (workspace?.usageStopAt && !(await otherOpenBoot(boot))) {
				await setUsageStopAt(boot, null);
			}
			return "closed";
		}

		const nextSeq = boot.lockSeq + 1;
		const renewal = await autumnClient.check({
			customerId: boot.organizationId,
			featureId: BOX_GB_MINUTES_FEATURE_ID,
			requiredBalance: reservation(session.memoryMb),
			lock: {
				enabled: true,
				lockId: lockIdFor(bootId, nextSeq),
				expiresAt: Date.now() + LOCK_TTL_MS,
			},
		});
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
		if (renewal.allowed) {
			if (stopAt) await setUsageStopAt(boot, null);
			return "renewed";
		}
		if (!stopAt) {
			await setUsageStopAt(boot, new Date(Date.now() + CAP_GRACE_MS));
			await queueSettle(bootId, CAP_GRACE_MS / 1000);
			return "warned";
		}
		if (stopAt.getTime() > Date.now()) return "warned";
		await stopSandbox(workspace.providerSandboxId);
		await setUsageStopAt(boot, null);
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
		rows.map(({ id, providerSandboxId }) =>
			providerSandboxId
				? stopSandbox(providerSandboxId).catch((error) =>
						Sentry.captureException(error, { extra: { bootId: id } }),
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

async function adoptRunningBoxes(): Promise<number> {
	const names = await listActiveWorkspaceSandboxes(
		Date.now() - RECONCILE_LOOKBACK_MS,
	);
	if (names.length === 0) return 0;
	const unmetered = await db
		.select({
			id: cloudWorkspaces.id,
			organizationId: cloudWorkspaces.organizationId,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
		})
		.from(cloudWorkspaces)
		.where(
			and(
				eq(cloudWorkspaces.provider, "vercel"),
				ne(cloudWorkspaces.status, "failed"),
				inArray(cloudWorkspaces.providerSandboxId, names),
				sql`not exists (select 1 from ${cloudWorkspaceBoots} boot where boot.cloud_workspace_id = ${cloudWorkspaces.id} and boot.stopped_at is null)`,
			),
		);
	let adopted = 0;
	for (const workspace of unmetered) {
		const found = await findSandboxSession(workspace.providerSandboxId, null);
		const session = found?.session;
		if (!session || session.endedAt !== null) continue;
		const claimed = await db
			.select({ id: cloudWorkspaceBoots.id })
			.from(cloudWorkspaceBoots)
			.where(eq(cloudWorkspaceBoots.vercelSessionId, session.id));
		if (claimed.length > 0) continue;
		let bootId: string | null = null;
		try {
			({ bootId } = await authorizeBoot({
				organizationId: workspace.organizationId,
				cloudWorkspaceId: workspace.id,
				memoryMb: session.memoryMb,
				vcpus: session.vcpus,
			}));
			if (!bootId) continue;
			await db
				.update(cloudWorkspaceBoots)
				.set({
					vercelSessionId: session.id,
					startedAt: new Date(session.startedAt),
					finalizedThrough: new Date(),
				})
				.where(eq(cloudWorkspaceBoots.id, bootId));
			adopted += 1;
		} catch (error) {
			if (bootId) await releaseBoot(bootId).catch(() => {});
			const refused = (CLOUD_USAGE_REFUSAL_KEYS as readonly string[]).includes(
				String((error as { cause?: { i18nKey?: unknown } }).cause?.i18nKey),
			);
			if (!refused) {
				Sentry.captureException(error, {
					extra: { cloudWorkspaceId: workspace.id },
				});
				continue;
			}
			console.error(
				`[cloud-workspace/meter] ${workspace.id} runs past its limit; stopping it`,
			);
			await stopSandbox(workspace.providerSandboxId);
		}
	}
	return adopted;
}

/**
 * Queues a settle for every open boot, and starts metering boxes running
 * without one (boxes already up when metering shipped).
 */
export async function reconcileCloudWorkspaceUsage(): Promise<{
	adopted: number;
	queued: number;
	failed: number;
}> {
	if (!billingUsesAutumn) return { adopted: 0, queued: 0, failed: 0 };
	const adopted = await adoptRunningBoxes().catch((error) => {
		Sentry.captureException(error);
		return 0;
	});
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
	return { adopted, queued: ids.length - failed, failed };
}
