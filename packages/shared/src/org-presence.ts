export type OrgPresenceStatus = "active" | "away";

/** Sent by windows that report presence; the org hub answers without waking. */
export const ORG_PRESENCE_PING = "ping";
export const ORG_PRESENCE_PONG = "pong";
export const ORG_PRESENCE_PING_MS = 30_000;
/** No input or focus for this long and a window reads as away, as in Slack. */
export const ORG_PRESENCE_AWAY_AFTER_MS = 10 * 60_000;

/** Hub to windows: everyone with a window open in the organization. */
export interface OrgPresenceMessage {
	type: "presence";
	users: Record<string, OrgPresenceStatus>;
}

/** A window to the hub: how its user is doing right now. */
export interface OrgPresenceReport {
	type: "presence";
	status: OrgPresenceStatus;
}

function isStatus(value: unknown): value is OrgPresenceStatus {
	return value === "active" || value === "away";
}

function parseObject(raw: unknown): Record<string, unknown> | null {
	if (typeof raw !== "string") return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export function parseOrgPresenceMessage(
	raw: unknown,
): OrgPresenceMessage | null {
	const value = parseObject(raw);
	if (value?.type !== "presence") return null;
	const users = value.users;
	if (typeof users !== "object" || users === null) return null;
	return {
		type: "presence",
		users: Object.fromEntries(
			Object.entries(users).filter(([, status]) => isStatus(status)),
		) as Record<string, OrgPresenceStatus>,
	};
}

export function parseOrgPresenceReport(raw: unknown): OrgPresenceReport | null {
	const value = parseObject(raw);
	if (value?.type !== "presence" || !isStatus(value.status)) return null;
	return { type: "presence", status: value.status };
}

/** One person, many windows: any window in use makes them active. */
export function summarizeOrgPresence(
	windows: Iterable<{ userId: string; status: OrgPresenceStatus }>,
): Record<string, OrgPresenceStatus> {
	const users: Record<string, OrgPresenceStatus> = {};
	for (const { userId, status } of windows) {
		if (users[userId] !== "active") users[userId] = status;
	}
	return users;
}
