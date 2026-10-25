import { MAX_PRESENCE_VISITORS } from "@superset/shared/page-presence";
import { PresenceVisits } from "@superset/shared/presence-visits";
import {
	canOpenWorkspace,
	parseVersionedWorkspaceAccess,
	type VersionedWorkspaceAccess,
	type WorkspaceActor,
} from "@superset/shared/workspace-access";
import { type Connection, type ConnectionContext, Server } from "partyserver";
import type { RealtimeEnv } from "./types";
import { admission, type StoredAccess, supersedes } from "./utils/admission";
import {
	broadcastPresence,
	SWEEP_MS,
	scheduleSweep,
	sweepSilent,
} from "./utils/presence";

interface Viewer extends WorkspaceActor {
	name: string;
	image: string | null;
	observer: boolean;
	connectedAt: number;
}

export const WORKSPACE_CLAIMS_HEADER = "x-superset-workspace-claims";

/**
 * One object per cloud workspace: who is in it now and who has been. An
 * observer (the workspace's record view) sees both without counting as a
 * visit.
 */
export class WorkspaceHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	private ready = false;
	private access: StoredAccess | undefined;
	private readonly visits: PresenceVisits;

	constructor(ctx: DurableObjectState, env: RealtimeEnv) {
		super(ctx, env);
		this.visits = new PresenceVisits(ctx.storage.sql);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	private schema(): void {
		if (this.ready) return;
		this.visits.ensureSchema();
		this.ready = true;
	}

	async onConnect(
		connection: Connection<Viewer>,
		ctx: ConnectionContext,
	): Promise<void> {
		this.schema();
		let claims: {
			userId?: unknown;
			name?: unknown;
			image?: unknown;
			organizationIds?: unknown;
			teamIds?: unknown;
			observer?: unknown;
		};
		try {
			claims = JSON.parse(
				ctx.request.headers.get(WORKSPACE_CLAIMS_HEADER) ?? "",
			);
		} catch {
			connection.close(4401, "unauthorized");
			return;
		}
		if (
			typeof claims.userId !== "string" ||
			typeof claims.name !== "string" ||
			!Array.isArray(claims.organizationIds) ||
			!Array.isArray(claims.teamIds)
		) {
			connection.close(4401, "unauthorized");
			return;
		}
		const viewer: Viewer = {
			userId: claims.userId,
			name: claims.name,
			image: typeof claims.image === "string" ? claims.image : null,
			organizationIds: claims.organizationIds.filter(
				(id) => id === this.organizationId,
			),
			teamIds: claims.teamIds,
			observer: claims.observer === true,
			connectedAt: Date.now(),
		};
		let admitted: boolean;
		try {
			admitted = await this.admit(viewer);
		} catch {
			connection.close(1013, "unavailable");
			return;
		}
		if (!admitted) {
			connection.close(4403, "Not found");
			return;
		}
		const now = Date.now();
		connection.setState(viewer);
		if (!viewer.observer) {
			this.visits.record(
				{ userId: viewer.userId, name: viewer.name, image: viewer.image },
				now,
			);
		}
		this.announce();
		await scheduleSweep(this.ctx.storage, now);
	}

	/** Called by the API when the workspace is created or its visibility or sharing changes. */
	async accessChanged(versioned: VersionedWorkspaceAccess): Promise<void> {
		if (!(await this.storeAccess(versioned))) return;
		const { access } = versioned;
		let removed = false;
		for (const connection of this.getConnections<Viewer>()) {
			const viewer = connection.state;
			if (viewer && (!access || !canOpenWorkspace(access, viewer))) {
				try {
					connection.close(4403, "Not found");
				} catch {}
				removed = true;
			}
		}
		if (removed) {
			this.schema();
			this.announce();
		}
	}

	private async admit(viewer: Viewer): Promise<boolean> {
		const stored = await this.readStoredAccess();
		const decision = admission(stored, viewer, Date.now());
		if (decision.kind === "admit") {
			if (decision.refresh) this.ctx.waitUntil(this.refreshAccess());
			return true;
		}
		if (decision.kind === "refuse") return false;
		try {
			await this.storeAccess(await this.fetchAccess());
		} catch (error) {
			if (stored) return false;
			throw error;
		}
		const access = this.access?.access ?? null;
		return access !== null && canOpenWorkspace(access, viewer);
	}

	private async refreshAccess(): Promise<void> {
		try {
			await this.accessChanged(await this.fetchAccess());
		} catch {}
	}

	private async readStoredAccess(): Promise<StoredAccess | undefined> {
		this.access ??= await this.ctx.storage.get<StoredAccess>("access");
		return this.access;
	}

	private async storeAccess(versioned: StoredAccess): Promise<boolean> {
		if (!supersedes(versioned, await this.readStoredAccess())) return false;
		this.access = versioned;
		await this.ctx.storage.put("access", versioned);
		return true;
	}

	private get organizationId(): string {
		return this.name.split(":")[0] ?? "";
	}

	private async fetchAccess(): Promise<StoredAccess> {
		const [organizationId, workspaceId] = this.name.split(":");
		const response = await fetch(
			`${this.env.NEXT_PUBLIC_API_URL}/api/cloud-workspaces/${workspaceId}/realtime-access`,
			{
				headers: { authorization: `Bearer ${this.env.NUDGE_SECRET}` },
				signal: AbortSignal.timeout(5_000),
			},
		);
		if (!response.ok) throw new Error(`access lookup: ${response.status}`);
		const versioned = parseVersionedWorkspaceAccess(await response.json());
		if (!versioned) throw new Error("access lookup: malformed");
		return versioned.access?.organizationId === organizationId
			? versioned
			: { access: null, readAt: versioned.readAt };
	}

	async onClose(connection: Connection<Viewer>): Promise<void> {
		const viewer = connection.state;
		if (!viewer) return;
		this.schema();
		if (!viewer.observer) this.visits.touch(viewer.userId, Date.now());
		this.announce(connection.id);
	}

	async onAlarm(): Promise<void> {
		const now = Date.now();
		const { evicted, remaining } = sweepSilent(
			[...this.getConnections<Viewer>()].map((connection) => ({
				connection,
				connectedAt: connection.state?.connectedAt,
				heardAt: this.ctx.getWebSocketAutoResponseTimestamp(connection),
			})),
			now,
		);
		if (evicted) {
			this.schema();
			this.announce();
		}
		if (remaining > 0) await this.ctx.storage.setAlarm(now + SWEEP_MS);
	}

	/** Observers hear presence but are not part of it. */
	private announce(leaving?: string): void {
		const connections = [...this.getConnections<Viewer>()].filter(
			(connection) => connection.state && connection.id !== leaving,
		);
		broadcastPresence(
			connections.map((connection) => ({
				connection,
				userId: connection.state?.userId ?? "",
				seesVisitors: true,
			})),
			connections.flatMap((connection) => {
				const viewer = connection.state;
				if (!viewer || viewer.observer) return [];
				return [
					{
						userId: viewer.userId,
						viewer: {
							id: connection.id,
							key: viewer.userId,
							name: viewer.name,
							image: viewer.image,
							guest: false,
							guestNumber: null,
							color: 0,
						},
					},
				];
			}),
			this.visits.recent(MAX_PRESENCE_VISITORS),
		);
	}
}
