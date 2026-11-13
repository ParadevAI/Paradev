export const BOX_PRESSURE_LEVELS = ["busy", "critical"] as const;
export type BoxPressureLevel = (typeof BOX_PRESSURE_LEVELS)[number];

export const BOX_RESOURCES = ["cpu", "memory"] as const;
export type BoxResource = (typeof BOX_RESOURCES)[number];

/** A box under pressure, as its host-service last reported it. A box that is fine has no entry. */
export interface BoxPressure {
	level: BoxPressureLevel;
	limitedBy: BoxResource[];
	/** The newest process memguard killed this session, if any. */
	reap: { processName: string; rssMb: number; at: number } | null;
	at: number;
}

/** A box re-reports while under pressure, so a stopped box's entry ages out. */
export const BOX_PRESSURE_HEARTBEAT_MS = 5 * 60_000;
export const BOX_PRESSURE_TTL_MS = 3 * BOX_PRESSURE_HEARTBEAT_MS;

/** Org windows get the whole map on connect, then one entry per change; null clears it. */
export interface BoxPressureMessage {
	type: "box-pressure";
	snapshot: boolean;
	workspaces: Record<string, BoxPressure | null>;
}

const MAX_PROCESS_NAME = 64;

function isFiniteNonNegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseBoxPressure(value: unknown): BoxPressure | null {
	if (typeof value !== "object" || value === null) return null;
	const input = value as Record<string, unknown>;
	if (!(BOX_PRESSURE_LEVELS as readonly unknown[]).includes(input.level)) {
		return null;
	}
	if (
		!Array.isArray(input.limitedBy) ||
		!input.limitedBy.every((resource) =>
			(BOX_RESOURCES as readonly unknown[]).includes(resource),
		) ||
		!isFiniteNonNegative(input.at)
	) {
		return null;
	}
	let reap: BoxPressure["reap"] = null;
	if (input.reap !== null && input.reap !== undefined) {
		const raw = input.reap as Record<string, unknown>;
		if (
			typeof raw.processName !== "string" ||
			!isFiniteNonNegative(raw.rssMb) ||
			!isFiniteNonNegative(raw.at)
		) {
			return null;
		}
		reap = {
			processName: raw.processName.slice(0, MAX_PROCESS_NAME),
			rssMb: raw.rssMb,
			at: raw.at,
		};
	}
	return {
		level: input.level as BoxPressureLevel,
		limitedBy: [...new Set(input.limitedBy as BoxResource[])],
		reap,
		at: input.at,
	};
}

export function parseBoxPressureMessage(
	raw: unknown,
): BoxPressureMessage | null {
	if (typeof raw !== "string") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const message = parsed as Record<string, unknown>;
	if (
		message.type !== "box-pressure" ||
		typeof message.snapshot !== "boolean" ||
		typeof message.workspaces !== "object" ||
		message.workspaces === null
	) {
		return null;
	}
	const workspaces: Record<string, BoxPressure | null> = {};
	for (const [workspaceId, value] of Object.entries(message.workspaces)) {
		if (value === null) {
			workspaces[workspaceId] = null;
			continue;
		}
		const pressure = parseBoxPressure(value);
		if (pressure) workspaces[workspaceId] = pressure;
	}
	return { type: "box-pressure", snapshot: message.snapshot, workspaces };
}
