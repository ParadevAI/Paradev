// Pure, so the admin repo's daily check can share it: it vendors packages/db but not the Autumn client.

import { ACTIVE_CPU_MINUTES_FEATURE_ID } from "@superset/shared/billing";
import {
	type CloudUsageFeature,
	cloudUsageFeatureValues,
} from "./schema/enums";

/** One event as Autumn's `events.list` returns it. */
export interface AutumnUsageEvent {
	id: string;
	timestamp: number;
	featureId: string;
	customerId: string;
	value: number;
	properties: Record<string, unknown>;
}

/** Autumn's net for one lock of a boot, one per feature: the amount a `cloud_usage_events` row holds. */
export interface AutumnLockUsage {
	bootId: string;
	lockSeq: number;
	feature: CloudUsageFeature;
	organizationId: string;
	cloudWorkspaceId: string | null;
	userId: string | null;
	amount: number;
	events: number;
	lastEventAt: number;
}

/** A lock's events in Autumn are final this long after its last one: Autumn refunds a lock when it expires at 70 minutes. */
export const LOCK_SETTLED_MS = 80 * 60 * 1000;

/** Launch-night GB-minutes Autumn holds under a boot but no lock. */
export const LEGACY_LOCK_SEQ = -1;
const LEGACY_CORRECTION = "legacy-lock-attribution";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bootIdOf(event: AutumnUsageEvent): string | null {
	const { bootId } = event.properties;
	return typeof bootId === "string" && bootId !== "" ? bootId : null;
}

function lockSeqOf(event: AutumnUsageEvent): number | null {
	const { lockSeq } = event.properties;
	if (lockSeq === undefined || lockSeq === null || lockSeq === "") return null;
	const seq = Number(lockSeq);
	return Number.isInteger(seq) ? seq : null;
}

type UsageFeatureEvent = AutumnUsageEvent & { featureId: CloudUsageFeature };

function isUsageEvent(event: AutumnUsageEvent): event is UsageFeatureEvent {
	return (cloudUsageFeatureValues as readonly string[]).includes(
		event.featureId,
	);
}

/**
 * On launch night each event sent without a lock was reversed (no boot) and re-sent with its boot.
 * A CPU original already named its boot, so its re-send and that reversal are a pair to drop.
 */
function duplicateResends(events: AutumnUsageEvent[]): Set<AutumnUsageEvent> {
	const dropped = new Set<AutumnUsageEvent>();
	const corrections = events.filter(
		(event) => event.properties.correction === LEGACY_CORRECTION,
	);
	for (const resend of corrections) {
		const bootId = bootIdOf(resend);
		if (!bootId) continue;
		const original = events.find(
			(event) =>
				bootIdOf(event) === bootId &&
				event.featureId === resend.featureId &&
				event.value === resend.value &&
				event.properties.correction === undefined &&
				lockSeqOf(event) === null,
		);
		const reversal = corrections.find(
			(event) =>
				!dropped.has(event) &&
				bootIdOf(event) === null &&
				event.customerId === resend.customerId &&
				event.featureId === resend.featureId &&
				event.value === -resend.value,
		);
		if (!original || !reversal) continue;
		dropped.add(resend);
		dropped.add(reversal);
	}
	return dropped;
}

/**
 * Sums Autumn's events per boot, lock sequence and feature, each event id once (Autumn's event
 * store can list one twice). `bootLockSeqs` holds every boot row's
 * current lock_seq: a CPU event with no lock belongs to the boot's last lock, as the meter sends it
 * at close. An event with no boot, or a boot with no row, is returned in `untied`.
 */
export function autumnUsageByLock(
	events: AutumnUsageEvent[],
	bootLockSeqs: ReadonlyMap<string, number>,
): { locks: AutumnLockUsage[]; untied: AutumnUsageEvent[] } {
	const usage = [
		...new Map(events.map((event) => [event.id, event])).values(),
	].filter(isUsageEvent);
	const dropped = duplicateResends(usage);
	const locks = new Map<string, AutumnLockUsage>();
	const untied: AutumnUsageEvent[] = [];
	for (const event of usage) {
		if (dropped.has(event)) continue;
		const bootId = bootIdOf(event);
		const finalSeq = bootId === null ? undefined : bootLockSeqs.get(bootId);
		if (bootId === null || finalSeq === undefined) {
			untied.push(event);
			continue;
		}
		const feature = event.featureId;
		const lockSeq =
			lockSeqOf(event) ??
			(feature === ACTIVE_CPU_MINUTES_FEATURE_ID ? finalSeq : LEGACY_LOCK_SEQ);
		const key = `${bootId}:${lockSeq}:${feature}`;
		const { workspaceId, userId } = event.properties;
		const lock = locks.get(key) ?? {
			bootId,
			lockSeq,
			feature,
			organizationId: event.customerId,
			cloudWorkspaceId:
				typeof workspaceId === "string" && UUID.test(workspaceId)
					? workspaceId
					: null,
			userId: typeof userId === "string" && UUID.test(userId) ? userId : null,
			amount: 0,
			events: 0,
			lastEventAt: event.timestamp,
		};
		lock.amount += event.value;
		lock.events += 1;
		lock.lastEventAt = Math.max(lock.lastEventAt, event.timestamp);
		locks.set(key, lock);
	}
	return { locks: [...locks.values()], untied };
}
