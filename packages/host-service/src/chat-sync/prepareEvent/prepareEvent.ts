import type { DurableEvent } from "@superset/chat/protocol";
import { eventBytes } from "@superset/trpc/chat-history-schema";

export { eventBytes };

const MAX_STRING_CHARS = 64 * 1024;
const TIGHT_STRING_CHARS = 4 * 1024;
export const MAX_EVENT_BYTES = 400 * 1024;
const CUT_MARKER = "\n…[cut for cloud storage]";
const MESSAGE_KINDS = new Set(["user_message", "agent_message"]);
const MESSAGE_BODY_KEYS = new Set(["text", "content"]);
const CLOUD_SESSION_KEYS = [
	"status",
	"harness",
	"title",
	"harnessSessionId",
	"modeId",
	"modelId",
] as const;

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

/** The ids the cloud keys rows by, which a cut must not shorten. */
function keepIds(original: DurableEvent, cut: DurableEvent): DurableEvent {
	if (original.type === "item" && cut.type === "item") {
		return {
			...cut,
			turnId: original.turnId,
			item: { ...cut.item, id: original.item.id },
		};
	}
	if (original.type === "turn" && cut.type === "turn") {
		return { ...cut, turn: { ...cut.turn, id: original.turn.id } };
	}
	return cut;
}

function cutEvent(
	event: DurableEvent,
	otherLimit: number,
	messageLimit: number,
): DurableEvent {
	const cut = keepIds(event, cutStrings(event, otherLimit) as DurableEvent);
	if (cut.type !== "item" || event.type !== "item") return cut;
	if (!MESSAGE_KINDS.has(event.item.kind)) return cut;
	const item: Record<string, unknown> = { ...cut.item };
	for (const key of MESSAGE_BODY_KEYS) {
		if (key in event.item) {
			item[key] = cutStrings(
				(event.item as Record<string, unknown>)[key],
				messageLimit,
			);
		}
	}
	return { ...cut, item } as DurableEvent;
}

function cloudSession(event: DurableEvent): DurableEvent {
	if (event.type !== "session") return event;
	const session: Record<string, unknown> = {};
	for (const key of CLOUD_SESSION_KEYS) {
		if (event.session[key] !== undefined) session[key] = event.session[key];
	}
	return { ...event, session } as DurableEvent;
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
 * fit keeps only its outline. A session keeps only its short fields; its
 * lists of modes, models, commands and tasks stay on the host. The agent's own
 * session file keeps everything.
 */
export function prepareEventForCloud(event: DurableEvent): DurableEvent {
	const prepared = cloudSession(event);
	let cut = prepared;
	for (const [otherLimit, messageLimit] of PASSES) {
		cut = cutEvent(prepared, otherLimit, messageLimit);
		if (eventBytes(cut) <= MAX_EVENT_BYTES) return cut;
	}
	return keepIds(prepared, omitBody(cut));
}
