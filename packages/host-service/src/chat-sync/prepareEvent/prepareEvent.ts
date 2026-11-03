import type { DurableEvent } from "@superset/chat/protocol";

const MAX_STRING_CHARS = 64 * 1024;
const TIGHT_STRING_CHARS = 4 * 1024;
export const MAX_EVENT_BYTES = 400 * 1024;
const CUT_MARKER = "\n…[cut for cloud storage]";
const MESSAGE_KINDS = new Set(["user_message", "agent_message"]);

/** Limits for other strings, then for message text, tried in order. */
const PASSES: [number, number][] = [
	[MAX_STRING_CHARS, Number.POSITIVE_INFINITY],
	[TIGHT_STRING_CHARS, Number.POSITIVE_INFINITY],
	[TIGHT_STRING_CHARS, MAX_STRING_CHARS],
	[TIGHT_STRING_CHARS, TIGHT_STRING_CHARS],
];

function cutString(value: string, limit: number): string {
	if (value.length <= limit) return value;
	let end = limit;
	const last = value.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end -= 1;
	return value.slice(0, end) + CUT_MARKER;
}

function cutStrings(value: unknown, limit: number): unknown {
	if (typeof value === "string") return cutString(value, limit);
	if (Array.isArray(value))
		return value.map((entry) => cutStrings(entry, limit));
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				cutStrings(entry, limit),
			]),
		);
	}
	return value;
}

export function eventBytes(event: unknown): number {
	return Buffer.byteLength(JSON.stringify(event));
}

function isMessage(event: DurableEvent): boolean {
	return event.type === "item" && MESSAGE_KINDS.has(event.item.kind);
}

/** Keeps an item's id, kind and short scalar fields; its body is dropped. */
function omitBody(event: DurableEvent): DurableEvent {
	if (event.type !== "item") return event;
	const item: Record<string, unknown> = { bodyOmitted: true };
	for (const [key, value] of Object.entries(event.item)) {
		if (Array.isArray(value)) item[key] = [];
		else if (typeof value === "string")
			item[key] = cutString(value, TIGHT_STRING_CHARS);
		else if (typeof value !== "object" || value === null) item[key] = value;
	}
	return { ...event, item } as DurableEvent;
}

/**
 * The copy of an event kept in the cloud, at most `MAX_EVENT_BYTES`: long
 * tool output is cut before message text, and an item that still does not
 * fit keeps only its outline. The session's command list, re-sent with every
 * status change, is dropped. The agent's own session file keeps everything.
 */
export function prepareEventForCloud(event: DurableEvent): DurableEvent {
	let prepared = event;
	if (event.type === "session") {
		const { availableCommands: _commands, ...session } = event.session;
		prepared = { ...event, session };
	}
	const message = isMessage(prepared);
	let cut = prepared;
	for (const [otherLimit, messageLimit] of PASSES) {
		cut = cutStrings(
			prepared,
			message ? messageLimit : otherLimit,
		) as DurableEvent;
		if (eventBytes(cut) <= MAX_EVENT_BYTES) return cut;
	}
	return omitBody(cut);
}
