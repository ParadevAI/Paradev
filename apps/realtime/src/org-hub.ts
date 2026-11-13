import type {
	BoxPressure,
	BoxPressureMessage,
} from "@superset/shared/box-pressure";
import {
	ORG_PRESENCE_PING,
	ORG_PRESENCE_PONG,
	type OrgPresenceMessage,
	type OrgPresenceStatus,
	parseOrgPresenceReport,
	summarizeOrgPresence,
} from "@superset/shared/org-presence";
import type {
	RealtimeNudgeKind,
	RealtimeNudgeMessage,
	RealtimeUpdate,
} from "@superset/shared/realtime";
import { type Connection, type ConnectionContext, Server } from "partyserver";
import type { RealtimeEnv } from "./types";
import {
	applyBoxPressure,
	type BoxPressureMap,
	sweepBoxPressure,
} from "./utils/box-pressure";
import { SWEEP_MS, sweepSilent } from "./utils/presence";

// A burst of writes is one message: kinds accumulate for this long, then one
// broadcast carries all of them.
const COALESCE_MS = 500;
const PENDING_KEY = "pendingKinds";
const PENDING_UPDATES_KEY = "pendingUpdates";
const BOX_PRESSURE_KEY = "boxPressure";

export const ORG_USER_HEADER = "x-superset-user-id";

interface OrgWindow {
	userId: string;
	status: OrgPresenceStatus;
	/** Older desktops never report or ping, so they are never swept as silent. */
	reports: boolean;
	connectedAt: number;
}

/**
 * One object per organization. Holds every subscribed window's socket
 * (hibernating, so idle subscribers cost nothing) and fans out invalidation
 * nudges the API sends after its writes. Besides what is waiting on the next
 * broadcast, it keeps one live map: the cloud boxes under pressure, which no
 * one needs once they recover or stop, so it never reaches Postgres.
 */
export class OrgHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	constructor(ctx: DurableObjectState, env: RealtimeEnv) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair(ORG_PRESENCE_PING, ORG_PRESENCE_PONG),
		);
	}

	// ── Presence: who has a window open, and whether they are using it ──

	async onConnect(
		connection: Connection<OrgWindow>,
		ctx: ConnectionContext,
	): Promise<void> {
		await this.sendBoxPressureSnapshot(connection);
		const userId = ctx.request.headers.get(ORG_USER_HEADER);
		if (!userId) return;
		connection.setState({
			userId,
			status: "active",
			reports: false,
			connectedAt: Date.now(),
		});
		this.announcePresence();
	}

	async onMessage(
		connection: Connection<OrgWindow>,
		message: string | ArrayBuffer,
	): Promise<void> {
		const report = parseOrgPresenceReport(message);
		const window = connection.state;
		if (!report || !window) return;
		const changed = window.status !== report.status || !window.reports;
		connection.setState({ ...window, status: report.status, reports: true });
		if (!window.reports) await this.scheduleAlarm(Date.now() + SWEEP_MS);
		if (changed) this.announcePresence();
	}

	async onClose(connection: Connection<OrgWindow>): Promise<void> {
		this.announcePresence(connection.id);
	}

	private announcePresence(leaving?: string): void {
		const windows = [...this.getConnections<OrgWindow>()].filter(
			(connection) => connection.state && connection.id !== leaving,
		);
		const message: OrgPresenceMessage = {
			type: "presence",
			users: summarizeOrgPresence(
				windows.flatMap((connection) =>
					connection.state ? [connection.state] : [],
				),
			),
		};
		const frame = JSON.stringify(message);
		for (const connection of windows) {
			if (!connection.state?.reports) continue;
			try {
				connection.send(frame);
			} catch {}
		}
	}

	/** Brings the alarm forward to `at`, never later: it also flushes nudges. */
	private async scheduleAlarm(at: number): Promise<void> {
		const current = await this.ctx.storage.getAlarm();
		if (current === null || current > at) await this.ctx.storage.setAlarm(at);
	}

	// ── RPC (called by the Worker) ────────────────────────────────────

	async nudge(kind: RealtimeNudgeKind, update?: RealtimeUpdate): Promise<void> {
		if (update) {
			const updates =
				(await this.ctx.storage.get<Record<string, RealtimeUpdate>>(
					PENDING_UPDATES_KEY,
				)) ?? {};
			updates[update.workspaceId] = update;
			await this.ctx.storage.put(PENDING_UPDATES_KEY, updates);
		} else {
			const pending =
				(await this.ctx.storage.get<RealtimeNudgeKind[]>(PENDING_KEY)) ?? [];
			if (!pending.includes(kind)) {
				await this.ctx.storage.put(PENDING_KEY, [...pending, kind]);
			}
		}
		await this.scheduleAlarm(Date.now() + COALESCE_MS);
	}

	async reportBoxPressure(
		workspaceId: string,
		pressure: BoxPressure | null,
	): Promise<void> {
		const { map, changed } = applyBoxPressure(
			await this.readBoxPressure(),
			workspaceId,
			pressure,
		);
		await this.ctx.storage.put(BOX_PRESSURE_KEY, map);
		if (pressure)
			await this.scheduleAlarm(
				sweepBoxPressure(map, Date.now()).nextExpiryAt ?? Date.now(),
			);
		if (changed) this.broadcastBoxPressure({ [workspaceId]: pressure }, false);
	}

	async subscriberCount(): Promise<number> {
		let count = 0;
		for (const _ of this.getConnections()) count++;
		return count;
	}

	// ── Fan-out ───────────────────────────────────────────────────────

	async onAlarm(): Promise<void> {
		await this.flushNudges();
		await this.sweepSilentWindows();
		await this.sweepBoxPressure();
	}

	// ── Box pressure ──────────────────────────────────────────────────

	private async readBoxPressure(): Promise<BoxPressureMap> {
		return (await this.ctx.storage.get<BoxPressureMap>(BOX_PRESSURE_KEY)) ?? {};
	}

	private async sendBoxPressureSnapshot(
		connection: Connection<OrgWindow>,
	): Promise<void> {
		const { map } = sweepBoxPressure(await this.readBoxPressure(), Date.now());
		const message: BoxPressureMessage = {
			type: "box-pressure",
			snapshot: true,
			workspaces: map,
		};
		try {
			connection.send(JSON.stringify(message));
		} catch {}
	}

	private broadcastBoxPressure(
		workspaces: BoxPressureMessage["workspaces"],
		snapshot: boolean,
	): void {
		const message: BoxPressureMessage = {
			type: "box-pressure",
			snapshot,
			workspaces,
		};
		this.broadcast(JSON.stringify(message));
	}

	private async sweepBoxPressure(): Promise<void> {
		const now = Date.now();
		const { map, expired, nextExpiryAt } = sweepBoxPressure(
			await this.readBoxPressure(),
			now,
		);
		if (expired.length > 0) {
			await this.ctx.storage.put(BOX_PRESSURE_KEY, map);
			this.broadcastBoxPressure(
				Object.fromEntries(expired.map((workspaceId) => [workspaceId, null])),
				false,
			);
		}
		if (nextExpiryAt !== null) await this.scheduleAlarm(nextExpiryAt);
	}

	/** Closes reporting windows that stopped pinging, so presence does not go stale. */
	private async sweepSilentWindows(): Promise<void> {
		const now = Date.now();
		const reporting = [...this.getConnections<OrgWindow>()].filter(
			(connection) => connection.state?.reports,
		);
		const { evicted, remaining } = sweepSilent(
			reporting.map((connection) => ({
				connection,
				connectedAt: connection.state?.connectedAt,
				heardAt: this.ctx.getWebSocketAutoResponseTimestamp(connection),
			})),
			now,
		);
		if (evicted) this.announcePresence();
		if (remaining > 0) await this.scheduleAlarm(now + SWEEP_MS);
	}

	private async flushNudges(): Promise<void> {
		const kinds =
			(await this.ctx.storage.get<RealtimeNudgeKind[]>(PENDING_KEY)) ?? [];
		const updates = Object.values(
			(await this.ctx.storage.get<Record<string, RealtimeUpdate>>(
				PENDING_UPDATES_KEY,
			)) ?? {},
		);
		await this.ctx.storage.delete([PENDING_KEY, PENDING_UPDATES_KEY]);
		if (kinds.length === 0 && updates.length === 0) return;
		const message: RealtimeNudgeMessage = { type: "nudge", kinds, updates };
		this.broadcast(JSON.stringify(message));
	}
}
