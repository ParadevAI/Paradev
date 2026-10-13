import {
	MAX_PAGE_GUESTS,
	type PagePresenceViewer,
	PRESENCE_COLOR_COUNT,
} from "@superset/shared/page-presence";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	MAX_PAGE_STORAGE_LIST_KEYS,
	type PageStorageKeySummary,
	type PageStorageOp,
	type PageStorageRecord,
	type PageStorageScope,
	type PageStorageSocketMessage,
	type PageStorageWriteRequest,
	parsePageStorageScope,
} from "@superset/shared/page-storage";
import {
	guestReadable,
	readable,
	writableFor,
} from "@superset/shared/page-storage-access";
import type {
	PageStorageHubRequest,
	PageStorageHubResponse,
} from "@superset/shared/page-storage-hub";
import { PageStorageRecords } from "@superset/shared/page-storage-records";
import {
	type PageManifest,
	pageFrameOrigin,
	pageManifestKey,
	parsePageManifest,
} from "@superset/shared/usercontent";
import { type Connection, type ConnectionContext, Server } from "partyserver";
import type { RealtimeEnv } from "./types";

interface Pinned {
	userId: string;
	name: string;
	image: string | null;
	organizationIds: string[];
	author: boolean;
	writable: boolean;
	window: number;
	calls: number;
	scoped?: boolean;
	presence?: boolean;
	guest?: boolean;
	guestNumber?: number | null;
	colorSlot?: number;
	viewerKey?: string;
	connectedAt?: number;
}

interface PresenceClaims {
	userId: string;
	name: string;
	image: string | null;
	organizationIds: string[];
	guest: boolean;
}

export const CLAIMS_HEADER = "x-superset-page-claims";

const CALLS_PER_WINDOW = 60;
const WINDOW_MS = 10_000;
const MANIFEST_TTL_MS = 60_000;
const SWEEP_MS = 30_000;
const SILENT_MS = 75_000;
const NO_VIEWER = "\u0000";

export class PageHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	private ready = false;
	private manifest: PageManifest | null = null;
	private manifestReadAt = 0;
	private connectingGuests = 0;
	private writeWindows = new Map<string, { window: number; calls: number }>();
	private records: PageStorageRecords;

	constructor(ctx: DurableObjectState, env: RealtimeEnv) {
		super(ctx, env);
		this.records = new PageStorageRecords(ctx.storage.sql, (fn) =>
			ctx.storage.transactionSync(fn),
		);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	private schema(): void {
		if (this.ready) return;
		this.records.ensureSchema();
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS spent_nonces (
				nonce TEXT PRIMARY KEY,
				spent_at INTEGER NOT NULL
			)`,
		);
		this.ready = true;
	}

	async spendNonce(nonce: string, now: number): Promise<boolean> {
		this.schema();
		this.ctx.storage.sql.exec(
			"DELETE FROM spent_nonces WHERE spent_at < ?",
			now - 10 * 60_000,
		);
		const [existing] = this.ctx.storage.sql
			.exec<{ n: number }>(
				"SELECT count(*) AS n FROM spent_nonces WHERE nonce = ?",
				nonce,
			)
			.toArray();
		if ((existing?.n ?? 0) > 0) return false;
		this.ctx.storage.sql.exec(
			"INSERT INTO spent_nonces (nonce, spent_at) VALUES (?, ?)",
			nonce,
			now,
		);
		return true;
	}

	async readManifest(force = false): Promise<PageManifest | null> {
		const now = Date.now();
		if (!force && now - this.manifestReadAt < MANIFEST_TTL_MS) {
			return this.manifest;
		}
		const object = await this.env.PRIVATE.get(pageManifestKey(this.name));
		this.manifest = object ? parsePageManifest(await object.text()) : null;
		this.manifestReadAt = now;
		return this.manifest;
	}

	async manifestChanged(): Promise<void> {
		this.schema();
		const manifest = await this.readManifest(true);
		if (!manifest) {
			this.records.clearAll();
			for (const connection of this.getConnections<Pinned>()) {
				this.revoke(connection);
			}
			this.announce();
			return;
		}
		for (const connection of this.getConnections<Pinned>()) {
			const pinned = connection.state;
			if (!pinned) continue;
			const allowed = pinned.guest
				? guestReadable(manifest)
				: readable(manifest, {
						userId: pinned.userId,
						organizationIds: [...pinned.organizationIds],
					});
			if (!allowed) this.revoke(connection);
		}
		this.announce();
	}

	private revoke(connection: Connection<Pinned>): void {
		this.send(connection, { type: "revoked" });
		connection.close(4403, "revoked");
	}

	async onConnect(
		connection: Connection<Pinned>,
		ctx: ConnectionContext,
	): Promise<void> {
		this.schema();

		const raw = ctx.request.headers.get(CLAIMS_HEADER);
		if (!raw) {
			connection.close(4401, "unauthorized");
			return;
		}
		let claims: {
			userId: string;
			name: string;
			image: string | null;
			organizationIds: string[];
			nonce: string;
			presence?: boolean;
			guest?: boolean;
		};
		try {
			claims = JSON.parse(raw);
		} catch {
			connection.close(4401, "unauthorized");
			return;
		}

		if (claims.presence === true) {
			await this.joinPresence(connection, {
				userId: claims.userId,
				name: claims.name,
				image: claims.image,
				organizationIds: claims.organizationIds,
				guest: claims.guest === true,
			});
			return;
		}

		if (typeof claims.userId !== "string" || claims.userId.length === 0) {
			connection.close(4401, "unauthorized");
			return;
		}

		const origin = ctx.request.headers.get("origin");
		const expected = pageFrameOrigin(this.env.USERCONTENT_URL, this.name);
		if (origin !== expected) {
			connection.close(4403, "origin");
			return;
		}

		if (!(await this.spendNonce(claims.nonce, Date.now()))) {
			connection.close(4401, "ticket spent");
			return;
		}

		const manifest = await this.readManifest();
		const viewer = {
			userId: claims.userId,
			organizationIds: claims.organizationIds,
		};
		if (!manifest || !readable(manifest, viewer)) {
			connection.close(4403, "forbidden");
			return;
		}

		const pinned: Pinned = {
			userId: claims.userId,
			name: claims.name,
			image: claims.image,
			organizationIds: claims.organizationIds,
			author: manifest.createdByUserId === claims.userId,
			writable: writableFor(manifest, viewer),
			window: 0,
			calls: 0,
		};
		connection.setState(pinned);

		this.records.recordVisit(
			{ userId: pinned.userId, name: pinned.name, image: pinned.image },
			Date.now(),
		);

		this.send(connection, {
			type: "hello",
			viewer: {
				userId: pinned.userId,
				name: pinned.name,
				image: pinned.image,
			},
			author: pinned.author,
			writable: pinned.writable,
			scopes: true,
		});
	}

	private async joinPresence(
		connection: Connection<Pinned>,
		claims: PresenceClaims,
	): Promise<void> {
		if (claims.guest) {
			let guests = this.connectingGuests;
			for (const other of this.getConnections<Pinned>()) {
				if (other.state?.presence && other.state.guest) guests++;
			}
			if (guests >= MAX_PAGE_GUESTS) {
				connection.close(4429, "full");
				return;
			}
			this.connectingGuests++;
		}
		try {
			const manifest = await this.readManifest();
			const allowed =
				manifest &&
				(claims.guest ? guestReadable(manifest) : readable(manifest, claims));
			if (!allowed) {
				connection.close(4403, "forbidden");
				return;
			}
			const viewerKey = await this.viewerKeyFor(claims.userId);
			connection.setState({
				userId: claims.userId,
				name: claims.name,
				image: claims.image,
				organizationIds: claims.organizationIds,
				author: false,
				writable: false,
				window: 0,
				calls: 0,
				presence: true,
				guest: claims.guest,
				guestNumber: claims.guest ? this.guestNumberFor(claims.userId) : null,
				colorSlot: this.colorSlotFor(claims.userId),
				viewerKey,
				connectedAt: Date.now(),
			});
		} finally {
			if (claims.guest) this.connectingGuests--;
		}
		this.announce();
		if ((await this.ctx.storage.getAlarm()) === null) {
			await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
		}
	}

	async onAlarm(): Promise<void> {
		const now = Date.now();
		let remaining = 0;
		let evicted = false;
		for (const connection of this.getConnections<Pinned>()) {
			const heardAt =
				this.ctx.getWebSocketAutoResponseTimestamp(connection)?.getTime() ??
				connection.state?.connectedAt;
			if (heardAt && now - heardAt > SILENT_MS) {
				try {
					connection.close(4408, "silent");
				} catch {}
				evicted = true;
				continue;
			}
			remaining++;
		}
		if (evicted) this.announce();
		if (remaining > 0) await this.ctx.storage.setAlarm(now + SWEEP_MS);
	}

	async onClose(connection: Connection<Pinned>): Promise<void> {
		const pinned = connection.state;
		if (!pinned) return;
		if (pinned.presence) {
			this.announce(connection.id);
			return;
		}
		this.schema();
		this.records.touchVisit(pinned.userId, Date.now());
	}

	async onMessage(
		connection: Connection<Pinned>,
		message: string | ArrayBuffer,
	): Promise<void> {
		const pinned = connection.state;
		if (!pinned || pinned.presence || typeof message !== "string") return;

		let parsed: unknown;
		try {
			parsed = JSON.parse(message);
		} catch {
			return;
		}
		const call = parsed as { type?: unknown; id?: unknown; request?: unknown };
		if (call.type !== "call" || typeof call.id !== "string") return;

		if (!this.allow(connection, pinned)) {
			this.send(connection, {
				type: "result",
				id: call.id,
				ok: false,
				code: "rate_limited",
				message: "Too many storage calls; slow down",
			});
			return;
		}

		const request = call.request as PageStorageOp | undefined;
		if (request?.op === "list") {
			if (
				request.prefix !== undefined &&
				(typeof request.prefix !== "string" ||
					request.prefix.length > MAX_PAGE_STORAGE_KEY_LENGTH)
			) {
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: false,
					code: "invalid",
					message: `A storage key prefix is at most ${MAX_PAGE_STORAGE_KEY_LENGTH} characters`,
				});
				return;
			}
		} else if (!request || typeof request.key !== "string") {
			this.send(connection, {
				type: "result",
				id: call.id,
				ok: false,
				code: "invalid",
				message: "A storage call needs an op and a key",
			});
			return;
		} else if (
			request.key.length === 0 ||
			request.key.length > MAX_PAGE_STORAGE_KEY_LENGTH
		) {
			this.send(connection, {
				type: "result",
				id: call.id,
				ok: false,
				code: "invalid",
				message: `A storage key is 1 to ${MAX_PAGE_STORAGE_KEY_LENGTH} characters`,
			});
			return;
		}

		this.schema();
		const scope = parsePageStorageScope(request.scope);
		if (!scope) {
			this.send(connection, {
				type: "result",
				id: call.id,
				ok: false,
				code: "invalid",
				message: "A storage scope is slot, private or shared",
			});
			return;
		}
		const current = connection.state;
		if (request.scope !== undefined && current && !current.scoped) {
			connection.setState({
				...current,
				organizationIds: [...current.organizationIds],
				scoped: true,
			});
		}
		switch (request.op) {
			case "get":
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: {
						op: "get",
						value: this.records.get(scope, request.key, pinned.userId) ?? null,
					},
				});
				return;
			case "getAll":
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: {
						op: "getAll",
						records: this.records.list(scope, request.key, pinned.userId),
					},
				});
				return;
			case "list":
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: {
						op: "list",
						keys: this.records.listKeys(
							scope,
							request.prefix ?? "",
							pinned.userId,
							MAX_PAGE_STORAGE_LIST_KEYS,
						),
					},
				});
				return;
			case "set": {
				if (!pinned.writable) {
					this.send(connection, {
						type: "result",
						id: call.id,
						ok: false,
						code: "unauthenticated",
						message: "This viewer cannot write to this page",
					});
					return;
				}
				const refusal = this.records.set(
					scope,
					request.key,
					pinned.userId,
					request.value,
					Date.now(),
				);
				if (refusal) {
					this.send(connection, {
						type: "result",
						id: call.id,
						ok: false,
						...refusal,
					});
					return;
				}
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: { op: "set" },
				});
				this.push(scope, request.key, pinned.userId);
				return;
			}
			case "remove": {
				if (!pinned.writable) {
					this.send(connection, {
						type: "result",
						id: call.id,
						ok: false,
						code: "unauthenticated",
						message: "This viewer cannot write to this page",
					});
					return;
				}
				this.records.remove(scope, request.key, pinned.userId);
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: { op: "remove" },
				});
				this.push(scope, request.key, pinned.userId);
				return;
			}
			default:
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: false,
					code: "invalid",
					message: "Unknown storage op",
				});
		}
	}

	private allow(
		connection: Connection<Pinned>,
		pinned: { window: number; calls: number },
	): boolean {
		const now = Date.now();
		const window = Math.floor(now / WINDOW_MS);
		const calls = pinned.window === window ? pinned.calls + 1 : 1;
		const current = connection.state;
		if (!current) return false;
		connection.setState({
			userId: current.userId,
			name: current.name,
			image: current.image,
			organizationIds: [...current.organizationIds],
			author: current.author,
			writable: current.writable,
			scoped: current.scoped,
			window,
			calls,
		});
		return calls <= CALLS_PER_WINDOW;
	}

	private send(
		connection: Connection<Pinned>,
		message: PageStorageSocketMessage,
	): void {
		try {
			connection.send(JSON.stringify(message));
		} catch {}
	}

	private push(scope: PageStorageScope, key: string, owner: string): void {
		const records = this.records.list(scope, key, owner);
		for (const connection of this.getConnections<Pinned>()) {
			const state = connection.state;
			if (!state || state.presence) continue;
			if (scope !== "slot" && !state.scoped) continue;
			if (scope === "private" && state.userId !== owner) continue;
			try {
				connection.send(
					JSON.stringify({ type: "records", key, scope, records }),
				);
			} catch {}
		}
	}

	private guestNumberFor(userId: string): number {
		const taken = new Set<number>();
		for (const connection of this.getConnections<Pinned>()) {
			const state = connection.state;
			if (!state?.presence || !state.guest || !state.guestNumber) continue;
			if (state.userId === userId) return state.guestNumber;
			taken.add(state.guestNumber);
		}
		let number = 1;
		while (taken.has(number)) number++;
		return number;
	}

	private colorSlotFor(userId: string): number {
		const taken = new Set<number>();
		const users = new Set<string>();
		for (const connection of this.getConnections<Pinned>()) {
			const state = connection.state;
			if (!state?.presence || state.colorSlot === undefined) continue;
			if (state.userId === userId) return state.colorSlot;
			taken.add(state.colorSlot);
			users.add(state.userId);
		}
		for (let slot = 0; slot < PRESENCE_COLOR_COUNT; slot++) {
			if (!taken.has(slot)) return slot;
		}
		return users.size % PRESENCE_COLOR_COUNT;
	}

	private async viewerKeyFor(userId: string): Promise<string> {
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(`${this.name}:${userId}`),
		);
		return [...new Uint8Array(digest).slice(0, 8)]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
	}

	private announce(leaving?: string): void {
		const present: {
			connection: Connection<Pinned>;
			viewer: PagePresenceViewer;
		}[] = [];
		for (const connection of this.getConnections<Pinned>()) {
			const state = connection.state;
			if (!state?.presence || connection.id === leaving) continue;
			present.push({
				connection,
				viewer: {
					id: connection.id,
					key: state.viewerKey ?? connection.id,
					name: state.name,
					image: state.image,
					guest: state.guest === true,
					guestNumber: state.guestNumber ?? null,
					color: state.colorSlot ?? 0,
				},
			});
		}
		for (const { connection } of present) {
			const userId = connection.state?.userId;
			const viewers = present
				.filter((other) => other.connection.state?.userId !== userId)
				.map((other) => other.viewer);
			try {
				connection.send(JSON.stringify({ type: "presence", viewers }));
			} catch {}
		}
	}

	async apply(request: PageStorageHubRequest): Promise<PageStorageHubResponse> {
		this.schema();
		switch (request.op) {
			case "clear": {
				const touched = this.records
					.scopedKeys()
					.filter(
						(entry) => request.key === undefined || entry.key === request.key,
					);
				const cleared = this.records.clear(request.key);
				if (cleared === 0) return { ok: true, op: "clear", cleared };
				for (const { scope, key, owner } of touched) {
					this.push(scope, key, owner ?? "");
				}
				return { ok: true, op: "clear", cleared };
			}
			case "clearUser": {
				if (typeof request.userId !== "string" || request.userId.length === 0) {
					return {
						ok: false,
						code: "invalid",
						message: "A userId is required",
					};
				}
				const touched = this.records.scopedKeys();
				const { cleared, anonymized } = this.records.clearUser(request.userId);
				if (cleared === 0 && anonymized === 0) {
					return { ok: true, op: "clearUser", cleared };
				}
				for (const { scope, key, owner } of touched) {
					this.push(scope, key, owner ?? "");
				}
				return { ok: true, op: "clearUser", cleared };
			}
			default:
				return { ok: false, code: "invalid", message: "Unknown admin op" };
		}
	}

	async storageKeys(
		viewerId: string = NO_VIEWER,
	): Promise<PageStorageKeySummary[]> {
		this.schema();
		return this.records.keys(viewerId);
	}

	async storageRecords(
		key: string,
		scope: PageStorageScope = "slot",
		viewerId: string = NO_VIEWER,
	): Promise<PageStorageRecord[]> {
		this.schema();
		return this.records.list(scope, key, viewerId);
	}

	private allowWrite(userId: string): boolean {
		const window = Math.floor(Date.now() / WINDOW_MS);
		for (const [id, entry] of this.writeWindows) {
			if (entry.window !== window) this.writeWindows.delete(id);
		}
		const entry = this.writeWindows.get(userId);
		const calls = entry ? entry.calls + 1 : 1;
		this.writeWindows.set(userId, { window, calls });
		return calls <= CALLS_PER_WINDOW;
	}

	async storageWrite(
		writer: { userId: string; name: string | null; image: string | null },
		request: PageStorageWriteRequest,
	): Promise<
		| { ok: true }
		| {
				ok: false;
				code: "invalid" | "quota_exceeded" | "rate_limited";
				message: string;
		  }
	> {
		if (!this.allowWrite(writer.userId)) {
			return {
				ok: false,
				code: "rate_limited",
				message: "Too many storage writes; slow down",
			};
		}
		this.schema();
		const scope = parsePageStorageScope(request.scope);
		if (!scope) {
			return {
				ok: false,
				code: "invalid",
				message: "A storage scope is slot, private or shared",
			};
		}
		this.records.recordVisit(writer, Date.now());
		if (request.op === "remove") {
			this.records.remove(scope, request.key, writer.userId);
		} else {
			const refusal = this.records.set(
				scope,
				request.key,
				writer.userId,
				request.value,
				Date.now(),
			);
			if (refusal) return { ok: false, ...refusal };
		}
		this.push(scope, request.key, writer.userId);
		return { ok: true };
	}

	async subscriberCount(): Promise<number> {
		let count = 0;
		for (const _ of this.getConnections()) count++;
		return count;
	}
}
