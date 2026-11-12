import { randomBytes, randomUUID } from "node:crypto";
import {
	type AcquisitionTouch,
	CAMPAIGN_KEYS,
	CLICK_KEYS,
	isNonDirectTouch,
	sanitizeTouchSnapshot,
	type TouchOptions,
	type TrackingState,
} from "./touch";

export type { AcquisitionTouch, TouchSnapshot, TrackingState } from "./touch";

export const BRIDGE_TTL = {
	lineage: 90 * 24 * 60 * 60,
	attempt: 120,
	ticket: 120,
	pending: 30 * 60,
} as const;
export const BRIDGE_COOKIES = {
	lineage: "__Host-acq_lineage",
	attempt: "__Host-acq_attempt",
	pending: "__Host-acq_pending",
} as const;

export interface AcquisitionKV {
	get<T>(key: string): Promise<T | null>;
	getdel<T>(key: string): Promise<T | null>;
	set(
		key: string,
		value: unknown,
		options?: { ex?: number; nx?: boolean },
	): Promise<unknown>;
	eval(
		script: string,
		keys: string[],
		args: (string | number)[],
	): Promise<unknown>;
}

type Lineage = {
	id: string;
	state: "enabled" | "disabled";
	first: AcquisitionTouch | null;
	latestNonDirect: AcquisitionTouch | null;
	generation: number;
	revision: number;
	intentAt?: number;
	expiresAt: number;
	eventUuid: string;
	ownerId?: string;
};
type Attempt = {
	returnTo: string;
	expiresAt: number;
	touch?: AcquisitionTouch | null;
};
type Grant =
	| { state: "enabled"; credential: string; generation: number }
	| { state: "disabled" | "unavailable" };
type Ticket = { attempt: string; grant: Grant; expiresAt: number };
type Pending = {
	grant: Extract<Grant, { state: "enabled" }>;
	expiresAt: number;
};
export type LineageResult = {
	credential: string;
	anonymousId: string | null;
	setCookie: string;
};
export type ReceiveResult = {
	state: "enabled" | "disabled" | "unavailable" | "invalid";
	returnTo: string;
	pendingToken: string | null;
	setCookies: string[];
};
export type IdentifyEvent = {
	event: "$identify";
	distinctId: string;
	uuid: string;
	properties: {
		$anon_distinct_id: string;
		$set_once: Record<string, string>;
		$set: Record<string, string | null>;
	};
};

const TOKEN = /^[a-f0-9]{64}$/;
const token = () => randomBytes(32).toString("hex");
const key = (kind: string, id: string) => `acquisition-bridge:${kind}:${id}`;

// Redis checks the revision atomically; retries must also check intent ordering.
export const LINEAGE_CAS_SCRIPT = `local old = redis.call('GET', KEYS[1])
if not old or cjson.decode(old).revision ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;

export function validateReturnTo(value: unknown): string | null {
	if (
		typeof value !== "string" ||
		value.length > 8192 ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\") ||
		value.includes("#") ||
		[...value].some(
			(char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
		)
	)
		return null;
	const pathname = value.split("?")[0];
	if (
		!pathname ||
		/%/.test(pathname) ||
		pathname.split("/").some((part) => part === "." || part === "..")
	)
		return null;
	if (
		![
			"/sign-in",
			"/sign-up",
			"/auth/desktop/success",
			"/api/auth/desktop",
			"/api/auth/desktop/connect",
		].includes(pathname)
	)
		return null;
	return value;
}

export function bridgeCookie(
	name: keyof typeof BRIDGE_COOKIES,
	value: string,
	maxAge: number,
): string {
	if (value && !TOKEN.test(value)) throw new Error("Invalid cookie token");
	return `${BRIDGE_COOKIES[name]}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function readBridgeCookie(
	request: Request,
	name: keyof typeof BRIDGE_COOKIES,
): string | null {
	const values = (request.headers.get("cookie") ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.startsWith(`${BRIDGE_COOKIES[name]}=`));
	if (values.length !== 1) return null;
	const value = values[0]?.slice(BRIDGE_COOKIES[name].length + 1);
	return value && TOKEN.test(value) ? value : null;
}

export function hasExactOrigin(
	request: Request,
	expectedOrigin: string,
): boolean {
	try {
		const expected = new URL(expectedOrigin);
		return (
			/^https?:$/.test(expected.protocol) &&
			!expected.username &&
			!expected.password &&
			request.headers.get("origin") === expected.origin
		);
	} catch {
		return false;
	}
}

function properties(
	touch: AcquisitionTouch | null,
	prefix: string,
): Record<string, string> {
	return touch
		? Object.fromEntries(
				Object.entries(touch).map(([name, value]) => [
					`${prefix}${name}`,
					value,
				]),
			)
		: {};
}

function latestProperties(
	touch: AcquisitionTouch | null,
): Record<string, string | null> {
	if (!touch) return {};
	return Object.fromEntries(
		[
			...CAMPAIGN_KEYS,
			...CLICK_KEYS,
			"referrer_host",
			"landing_pathname",
			"timestamp",
		].map((name) => [
			`acquisition_latest_non_direct_${name}`,
			touch[name as keyof AcquisitionTouch] ?? null,
		]),
	);
}

export class AcquisitionBridge {
	private readonly now: () => number;
	constructor(
		private readonly kv: AcquisitionKV,
		private readonly options: TouchOptions & { now?: () => number } = {},
	) {
		this.now = options.now ?? Date.now;
	}

	private alive(record: { expiresAt: number } | null): boolean {
		return (
			!!record &&
			Number.isFinite(record.expiresAt) &&
			record.expiresAt > this.now()
		);
	}

	private async lineage(credential: unknown): Promise<Lineage | null> {
		if (typeof credential !== "string" || !TOKEN.test(credential)) return null;
		const record = await this.kv.get<Lineage>(key("lineage", credential));
		return this.alive(record) ? record : null;
	}

	async mintLineage(
		state: TrackingState,
		snapshot?: unknown,
		intentAt?: number,
	): Promise<LineageResult | null> {
		if (state !== "enabled" && state !== "disabled") return null;
		const credential = token();
		const now = this.now();
		const clean =
			state === "enabled"
				? sanitizeTouchSnapshot(snapshot, this.options)
				: null;
		const touch = clean
			? { ...clean, timestamp: new Date(now).toISOString() }
			: null;
		const record: Lineage = {
			id: `acq_${randomBytes(16).toString("hex")}`,
			state,
			first: touch,
			latestNonDirect: touch && isNonDirectTouch(touch) ? touch : null,
			generation: 1,
			revision: 1,
			intentAt,
			expiresAt: now + BRIDGE_TTL.lineage * 1000,
			eventUuid: randomUUID(),
		};
		await this.kv.set(key("lineage", credential), record, {
			ex: BRIDGE_TTL.lineage,
		});
		return {
			credential,
			anonymousId: state === "enabled" ? record.id : null,
			setCookie: bridgeCookie("lineage", credential, BRIDGE_TTL.lineage),
		};
	}

	async updateLineage(
		credential: unknown,
		state: TrackingState,
		snapshot?: unknown,
		intentAt?: number,
		expectedGeneration?: number,
	): Promise<LineageResult | null> {
		if (state !== "enabled" && state !== "disabled") return null;
		if (
			intentAt !== undefined &&
			(!Number.isSafeInteger(intentAt) || intentAt < 0)
		)
			return null;
		let orderedAt = intentAt;
		for (let retry = 0; retry < 4; retry++) {
			const old = await this.lineage(credential);
			if (
				expectedGeneration !== undefined &&
				old?.generation !== expectedGeneration
			)
				return null;
			if (!old) return this.mintLineage(state, snapshot, orderedAt);
			orderedAt ??= Math.max(this.now(), (old.intentAt ?? 0) + 1);
			if (orderedAt <= (old.intentAt ?? 0)) return null;
			const now = this.now();
			const clean =
				state === "enabled"
					? sanitizeTouchSnapshot(snapshot, this.options)
					: null;
			const touch = clean
				? { ...clean, timestamp: new Date(now).toISOString() }
				: null;
			const next: Lineage = {
				...old,
				state,
				...(old.state === "disabled" && state === "enabled"
					? { id: `acq_${randomBytes(16).toString("hex")}`, ownerId: undefined }
					: {}),
				first: state === "enabled" ? (old.first ?? touch) : null,
				latestNonDirect:
					state === "enabled"
						? touch && isNonDirectTouch(touch)
							? touch
							: old.latestNonDirect
						: null,
				generation: old.generation + (old.state !== state ? 1 : 0),
				revision: old.revision + 1,
				intentAt: orderedAt,
				eventUuid:
					old.state !== state ||
					(touch && (!old.first || isNonDirectTouch(touch)))
						? randomUUID()
						: old.eventUuid,
				expiresAt: now + BRIDGE_TTL.lineage * 1000,
			};
			if (
				(await this.kv.eval(
					LINEAGE_CAS_SCRIPT,
					[key("lineage", credential as string)],
					[old.revision, JSON.stringify(next), BRIDGE_TTL.lineage],
				)) === 1
			) {
				return {
					credential: credential as string,
					anonymousId: state === "enabled" ? next.id : null,
					setCookie: bridgeCookie(
						"lineage",
						credential as string,
						BRIDGE_TTL.lineage,
					),
				};
			}
		}
		throw new Error("Concurrent acquisition lineage update");
	}

	async revokeLineage(
		credential: unknown,
		intentAt?: number,
	): Promise<LineageResult | null> {
		if (!(await this.lineage(credential))) return null;
		return this.updateLineage(credential, "disabled", undefined, intentAt);
	}

	async begin(
		returnTo: string,
		snapshot?: unknown,
	): Promise<{ attempt: string; setCookie: string }> {
		const validated = validateReturnTo(returnTo);
		if (!validated) throw new Error("Invalid acquisition return path");
		const attempt = token();
		const clean = sanitizeTouchSnapshot(snapshot, this.options);
		await this.kv.set(
			key("attempt", attempt),
			{
				returnTo: validated,
				touch:
					clean && isNonDirectTouch(clean)
						? { ...clean, timestamp: new Date(this.now()).toISOString() }
						: null,
				expiresAt: this.now() + BRIDGE_TTL.attempt * 1000,
			} satisfies Attempt,
			{ ex: BRIDGE_TTL.attempt },
		);
		return {
			attempt,
			setCookie: bridgeCookie("attempt", attempt, BRIDGE_TTL.attempt),
		};
	}

	async issue(
		attempt: unknown,
		marketingCredential: unknown,
		collectEntry = true,
	): Promise<{ ticket: string; setCookie?: string } | null> {
		if (typeof attempt !== "string" || !TOKEN.test(attempt)) return null;
		const record = await this.kv.get<Attempt>(key("attempt", attempt));
		if (!this.alive(record)) return null;
		let lineage = await this.lineage(marketingCredential);
		let setCookie: string | undefined;
		if (
			collectEntry &&
			record?.touch &&
			(!lineage || lineage.state === "enabled")
		) {
			const result = await this.updateLineage(
				marketingCredential,
				"enabled",
				record.touch,
				undefined,
				lineage?.generation,
			);
			if (result) {
				marketingCredential = result.credential;
				setCookie = result.setCookie;
				lineage = await this.lineage(marketingCredential);
			}
		}
		const grant: Grant =
			lineage?.state === "enabled"
				? {
						state: "enabled",
						credential: marketingCredential as string,
						generation: lineage.generation,
					}
				: { state: lineage?.state === "disabled" ? "disabled" : "unavailable" };
		const ticket = token();
		await this.kv.set(
			key("ticket", ticket),
			{
				attempt,
				grant,
				expiresAt: this.now() + BRIDGE_TTL.ticket * 1000,
			} satisfies Ticket,
			{ ex: BRIDGE_TTL.ticket },
		);
		return { ticket, ...(setCookie ? { setCookie } : {}) };
	}

	async receive(
		ticket: unknown,
		attemptCookie: unknown,
	): Promise<ReceiveResult> {
		const invalid: ReceiveResult = {
			state: "invalid",
			returnTo: "/sign-in",
			pendingToken: null,
			setCookies: [bridgeCookie("pending", "", 0)],
		};
		if (
			typeof ticket !== "string" ||
			!TOKEN.test(ticket) ||
			typeof attemptCookie !== "string" ||
			!TOKEN.test(attemptCookie)
		)
			return invalid;
		const preview = await this.kv.get<Ticket>(key("ticket", ticket));
		if (!this.alive(preview) || preview?.attempt !== attemptCookie)
			return invalid;
		const received = await this.kv.getdel<Ticket>(key("ticket", ticket));
		if (!this.alive(received) || received?.attempt !== attemptCookie)
			return invalid;
		const attempt = await this.kv.getdel<Attempt>(
			key("attempt", attemptCookie),
		);
		if (
			!this.alive(attempt) ||
			!attempt ||
			!validateReturnTo(attempt.returnTo) ||
			!received
		)
			return invalid;
		const result: ReceiveResult = {
			state: received.grant.state,
			returnTo: attempt.returnTo,
			pendingToken: null,
			setCookies: [
				bridgeCookie("attempt", "", 0),
				bridgeCookie("pending", "", 0),
			],
		};
		if (received.grant.state === "enabled") {
			const pending = token();
			await this.kv.set(
				key("pending", pending),
				{
					grant: received.grant,
					expiresAt: this.now() + BRIDGE_TTL.pending * 1000,
				} satisfies Pending,
				{ ex: BRIDGE_TTL.pending },
			);
			result.pendingToken = pending;
			result.setCookies[1] = bridgeCookie(
				"pending",
				pending,
				BRIDGE_TTL.pending,
			);
		}
		return result;
	}

	async bind(
		pendingToken: unknown,
		trustedUserId: string,
	): Promise<IdentifyEvent | null> {
		if (
			!trustedUserId ||
			typeof trustedUserId !== "string" ||
			typeof pendingToken !== "string" ||
			!TOKEN.test(pendingToken)
		)
			return null;
		const pending = await this.kv.getdel<Pending>(key("pending", pendingToken));
		if (!this.alive(pending) || !pending || pending.grant.state !== "enabled")
			return null;
		const lineage = await this.lineage(pending.grant.credential);
		if (
			!lineage ||
			lineage.state !== "enabled" ||
			lineage.generation !== pending.grant.generation
		)
			return null;
		for (let retry = 0; retry < 4; retry++) {
			const current = await this.lineage(pending.grant.credential);
			if (
				!current ||
				current.state !== "enabled" ||
				current.generation !== pending.grant.generation ||
				(current.ownerId && current.ownerId !== trustedUserId)
			)
				return null;
			if (!current.ownerId) {
				const claimed = {
					...current,
					ownerId: trustedUserId,
					revision: current.revision + 1,
				};
				const remaining = Math.max(
					1,
					Math.ceil((current.expiresAt - this.now()) / 1000),
				);
				if (
					(await this.kv.eval(
						LINEAGE_CAS_SCRIPT,
						[key("lineage", pending.grant.credential)],
						[current.revision, JSON.stringify(claimed), remaining],
					)) !== 1
				)
					continue;
			}
			return {
				event: "$identify",
				distinctId: trustedUserId,
				uuid: current.eventUuid,
				properties: {
					$anon_distinct_id: current.id,
					$set_once: properties(current.first, "acquisition_first_"),
					$set: latestProperties(current.latestNonDirect),
				},
			};
		}
		return null;
	}
}
